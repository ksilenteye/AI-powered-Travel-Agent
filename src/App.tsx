import React, { useState, useEffect } from 'react';
import { 
  Plane, 
  MapPin, 
  Calendar, 
  Wallet, 
  Settings, 
  Plus, 
  LogOut, 
  CloudSun, 
  Navigation, 
  Hotel, 
  ChevronRight,
  History,
  TrendingUp,
  Loader2,
  Trash2,
  CheckCircle2,
  PiggyBank,
  AlertCircle,
  Sparkles,
  Compass
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User, 
  signOut 
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  deleteDoc, 
  serverTimestamp,
  getDocs
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { geminiService } from './services/gemini';
import { Trip, UserPreference, ItineraryDay, BudgetLevel, TripOptions, AISuggestedTrip } from './types';
import { format, addDays, differenceInDays, differenceInMonths } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [preferences, setPreferences] = useState<UserPreference | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [activeTab, setActiveTab] = useState<'trips' | 'preferences' | 'explore'>('trips');
  const [isCreatingTrip, setIsCreatingTrip] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [initialTripData, setInitialTripData] = useState<any>(null);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Preferences & Trips Listener
  useEffect(() => {
    if (!user) return;

    const prefQuery = query(collection(db, 'preferences'), where('userId', '==', user.uid));
    const unsubPref = onSnapshot(prefQuery, (snapshot) => {
      if (!snapshot.empty) {
        setPreferences({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as UserPreference);
      }
    });

    const tripQuery = query(collection(db, 'trips'), where('userId', '==', user.uid));
    const unsubTrips = onSnapshot(tripQuery, (snapshot) => {
      const tripData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Trip));
      setTrips(tripData.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
    });

    return () => {
      unsubPref();
      unsubTrips();
    };
  }, [user]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = () => signOut(auth);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F5F0] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#5A5A40]" />
      </div>
    );
  }

  if (!user) {
    return <LoginView onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-[#F5F5F0] text-[#1A1A1A] font-sans">
      {/* Sidebar / Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#E5E5E0] px-6 py-4 flex justify-around items-center z-50 md:top-0 md:bottom-auto md:flex-col md:w-20 md:h-full md:border-t-0 md:border-r">
        <div className="hidden md:block mb-8">
          <Plane className="w-8 h-8 text-[#5A5A40]" />
        </div>
        <NavButton active={activeTab === 'trips'} onClick={() => setActiveTab('trips')} icon={<MapPin />} label="Trips" />
        <NavButton active={activeTab === 'explore'} onClick={() => setActiveTab('explore')} icon={<TrendingUp />} label="Explore" />
        <NavButton active={activeTab === 'preferences'} onClick={() => setActiveTab('preferences')} icon={<Settings />} label="Settings" />
        <div className="md:mt-auto">
          <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-red-500 transition-colors">
            <LogOut className="w-6 h-6" />
          </button>
        </div>
      </nav>

      <main className="pb-24 md:pb-0 md:pl-20 min-h-screen">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <AnimatePresence mode="wait">
            {activeTab === 'trips' && (
              <motion.div
                key="trips"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <div className="flex justify-between items-center mb-8">
                  <div>
                    <h1 className="text-3xl font-serif font-medium text-[#5A5A40]">My Journeys</h1>
                    <p className="text-gray-500 text-sm mt-1">Plan your next adventure</p>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setIsDiscovering(true)}
                      className="bg-white text-[#5A5A40] border border-[#5A5A40] px-4 py-2 rounded-full flex items-center gap-2 hover:bg-[#5A5A40]/5 transition-colors shadow-sm"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span className="hidden sm:inline">Help me plan</span>
                    </button>
                    <button 
                      onClick={() => {
                        setInitialTripData(null);
                        setIsCreatingTrip(true);
                      }}
                      className="bg-[#5A5A40] text-white px-4 py-2 rounded-full flex items-center gap-2 hover:bg-[#4A4A30] transition-colors shadow-sm"
                    >
                      <Plus className="w-4 h-4" />
                      <span>New Trip</span>
                    </button>
                  </div>
                </div>

                {trips.length === 0 ? (
                  <EmptyTrips onNew={() => setIsCreatingTrip(true)} />
                ) : (
                  <div className="grid gap-6">
                    {trips.map(trip => (
                      <TripCard 
                        key={trip.id} 
                        trip={trip} 
                        onClick={() => setSelectedTrip(trip)} 
                      />
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'preferences' && (
              <motion.div
                key="preferences"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <PreferencesView user={user} preferences={preferences} />
              </motion.div>
            )}

            {activeTab === 'explore' && (
              <motion.div
                key="explore"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <ExploreView preferences={preferences} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Modals */}
      <AnimatePresence>
        {isCreatingTrip && (
          <CreateTripModal 
            user={user} 
            preferences={preferences}
            onClose={() => setIsCreatingTrip(false)} 
            initialData={initialTripData}
          />
        )}
        {isDiscovering && (
          <AITripDiscovery 
            user={user}
            preferences={preferences}
            onClose={() => setIsDiscovering(false)}
            onSelect={(suggestion) => {
              setInitialTripData({
                destination: suggestion.destination,
                budget: suggestion.estimatedBudget,
                duration: suggestion.duration,
                costBreakdown: suggestion.budgetBreakdown
              });
              setIsDiscovering(false);
              setIsCreatingTrip(true);
            }}
          />
        )}
        {selectedTrip && (
          <TripDetailsModal 
            trip={selectedTrip} 
            onClose={() => setSelectedTrip(null)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Sub-components ---

function LoginView({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="min-h-screen bg-[#F5F5F0] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        <div className="mb-8 inline-block p-4 bg-white rounded-3xl shadow-sm">
          <Plane className="w-12 h-12 text-[#5A5A40]" />
        </div>
        <h1 className="text-4xl font-serif font-medium text-[#5A5A40] mb-4">Travel Agent</h1>
        <p className="text-gray-600 mb-8">Your AI-powered companion for smarter, personalized travel planning.</p>
        <button 
          onClick={onLogin}
          className="w-full bg-[#5A5A40] text-white py-4 rounded-2xl font-medium hover:bg-[#4A4A30] transition-all shadow-lg flex items-center justify-center gap-3"
        >
          <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
          Sign in with Google
        </button>
      </div>
    </div>
  );
}

function NavButton({ active, icon, label, onClick }: { active: boolean, icon: React.ReactNode, label: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 p-2 transition-all rounded-xl",
        active ? "text-[#5A5A40] bg-[#5A5A40]/5" : "text-gray-400 hover:text-[#5A5A40]"
      )}
    >
      {React.isValidElement(icon) && React.cloneElement(icon as React.ReactElement<any>, { className: "w-6 h-6" })}
      <span className="text-[10px] font-medium uppercase tracking-wider md:hidden">{label}</span>
    </button>
  );
}

function TripCard({ trip, onClick }: { trip: Trip, onClick: () => void }) {
  return (
    <motion.div 
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      onClick={onClick}
      className="bg-white p-6 rounded-[32px] shadow-sm border border-[#E5E5E0] cursor-pointer group"
    >
      <div className="flex justify-between items-start">
        <div className="flex gap-4">
          <div className="w-12 h-12 bg-[#F5F5F0] rounded-2xl flex items-center justify-center text-[#5A5A40]">
            <MapPin className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-serif font-medium text-[#5A5A40] group-hover:underline underline-offset-4">{trip.destination}</h3>
            <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
              <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {trip.startDate}</span>
              <span className="flex items-center gap-1 uppercase tracking-tighter font-mono">{trip.status}</span>
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-medium text-[#5A5A40]">₹{trip.budget}</div>
          <div className="text-[10px] text-gray-400 uppercase tracking-widest">{trip.transportType}</div>
        </div>
      </div>
    </motion.div>
  );
}

function EmptyTrips({ onNew }: { onNew: () => void }) {
  return (
    <div className="text-center py-20 bg-white rounded-[32px] border border-dashed border-gray-300">
      <div className="mb-4 inline-block p-4 bg-[#F5F5F0] rounded-full">
        <Navigation className="w-8 h-8 text-gray-400" />
      </div>
      <h3 className="text-lg font-medium text-gray-600">No trips planned yet</h3>
      <p className="text-gray-400 text-sm mt-1 mb-6">Start by creating your first itinerary</p>
      <button 
        onClick={onNew}
        className="text-[#5A5A40] font-medium hover:underline"
      >
        Plan a trip now
      </button>
    </div>
  );
}

function PreferencesView({ user, preferences }: { user: User, preferences: UserPreference | null }) {
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<UserPreference>>(preferences || {
    userId: user.uid,
    budgetLevel: 'moderate',
    transportPreference: ['air'],
    stayPreference: 'Hotels',
    interests: ['Nature']
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      if (preferences?.id) {
        await updateDoc(doc(db, 'preferences', preferences.id), { ...formData, updatedAt: serverTimestamp() });
      } else {
        await addDoc(collection(db, 'preferences'), { ...formData, userId: user.uid, updatedAt: serverTimestamp() });
      }
    } catch (error) {
      console.error("Save failed", error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white p-8 rounded-[32px] shadow-sm border border-[#E5E5E0]">
      <h2 className="text-2xl font-serif font-medium text-[#5A5A40] mb-6">Travel Profile</h2>
      
      <div className="space-y-8">
        <section>
          <label className="text-[10px] uppercase tracking-widest text-gray-400 font-bold block mb-3">Budget Style</label>
          <div className="flex gap-3">
            {(['budget', 'moderate', 'luxury'] as BudgetLevel[]).map(level => (
              <button 
                key={level}
                onClick={() => setFormData({ ...formData, budgetLevel: level })}
                className={cn(
                  "flex-1 py-3 rounded-2xl border transition-all capitalize text-sm",
                  formData.budgetLevel === level 
                    ? "bg-[#5A5A40] text-white border-[#5A5A40]" 
                    : "bg-white text-gray-600 border-gray-200 hover:border-[#5A5A40]"
                )}
              >
                {level}
              </button>
            ))}
          </div>
        </section>

        <section>
          <label className="text-[10px] uppercase tracking-widest text-gray-400 font-bold block mb-3">Interests</label>
          <div className="flex flex-wrap gap-2">
            {['Nature', 'History', 'Food', 'Adventure', 'Art', 'Shopping', 'Beaches', 'Mountains'].map(interest => (
              <button 
                key={interest}
                onClick={() => {
                  const current = formData.interests || [];
                  const next = current.includes(interest) 
                    ? current.filter(i => i !== interest)
                    : [...current, interest];
                  setFormData({ ...formData, interests: next });
                }}
                className={cn(
                  "px-4 py-2 rounded-full border text-xs transition-all",
                  formData.interests?.includes(interest)
                    ? "bg-[#5A5A40]/10 text-[#5A5A40] border-[#5A5A40]"
                    : "bg-white text-gray-500 border-gray-200 hover:border-[#5A5A40]"
                )}
              >
                {interest}
              </button>
            ))}
          </div>
        </section>

        <section>
          <label className="text-[10px] uppercase tracking-widest text-gray-400 font-bold block mb-3">Stay Preference</label>
          <select 
            value={formData.stayPreference}
            onChange={(e) => setFormData({ ...formData, stayPreference: e.target.value })}
            className="w-full p-4 rounded-2xl border border-gray-200 focus:outline-none focus:border-[#5A5A40] bg-[#F5F5F0]/50"
          >
            <option>Hotels</option>
            <option>Hostels</option>
            <option>Villas</option>
            <option>Apartments</option>
            <option>Resorts</option>
          </select>
        </section>

        <button 
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-[#5A5A40] text-white py-4 rounded-2xl font-medium hover:bg-[#4A4A30] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
          Save Preferences
        </button>
      </div>
    </div>
  );
}

function ExploreView({ preferences }: { preferences: UserPreference | null }) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSuggestions = async () => {
    if (!preferences) return;
    setLoading(true);
    try {
      const res = await geminiService.suggestLocations(preferences);
      setSuggestions(res);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (preferences && suggestions.length === 0) fetchSuggestions();
  }, [preferences]);

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-serif font-medium text-[#5A5A40]">Recommended for You</h2>
        <button onClick={fetchSuggestions} className="text-xs text-[#5A5A40] hover:underline flex items-center gap-1">
          <History className="w-3 h-3" /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-[#5A5A40]" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {suggestions?.map((loc, idx) => (
            <div key={idx} className="bg-white p-6 rounded-[32px] border border-[#E5E5E0] relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <MapPin className="w-20 h-20" />
              </div>
              <h3 className="text-xl font-serif font-medium text-[#5A5A40] mb-2">{loc}</h3>
              <p className="text-sm text-gray-500">Based on your interest in {preferences?.interests.join(", ")}.</p>
              <button className="mt-4 text-xs font-bold uppercase tracking-widest text-[#5A5A40] flex items-center gap-1">
                Plan Trip <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AITripDiscovery({ user, preferences, onClose, onSelect }: { user: User, preferences: UserPreference | null, onClose: () => void, onSelect: (suggestion: AISuggestedTrip) => void }) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<AISuggestedTrip[]>([]);
  const [formData, setFormData] = useState({
    location: '',
    budget: 50000,
    holidays: 5
  });

  const handleDiscover = async () => {
    if (!preferences) return alert("Please set your preferences first!");
    if (!formData.location) return alert("Please enter your current location!");
    setLoading(true);
    try {
      const res = await geminiService.suggestTripsByBudget(formData.location, formData.budget, formData.holidays, preferences);
      setSuggestions(res);
    } catch (error) {
      console.error(error);
      alert("Failed to get suggestions. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[110] flex items-center justify-center p-6">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white w-full max-w-3xl rounded-[40px] p-8 shadow-2xl overflow-hidden relative max-h-[90vh] overflow-y-auto"
      >
        <button onClick={onClose} className="absolute top-6 right-6 text-gray-400 hover:text-gray-600">
          <Plus className="w-6 h-6 rotate-45" />
        </button>

        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 bg-[#5A5A40]/10 rounded-2xl flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-[#5A5A40]" />
          </div>
          <div>
            <h2 className="text-2xl font-serif font-medium text-[#5A5A40]">AI Trip Discovery</h2>
            <p className="text-sm text-gray-500">Tell us your constraints, we'll find the perfect destination.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div>
            <label className="text-[10px] uppercase tracking-widest text-gray-400 font-bold block mb-2">My Location</label>
            <input 
              type="text"
              placeholder="e.g. Mumbai"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              className="w-full p-4 rounded-2xl border border-gray-200 focus:outline-none focus:border-[#5A5A40] bg-[#F5F5F0]/50 text-sm"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-gray-400 font-bold block mb-2">Budget (₹)</label>
            <input 
              type="number"
              value={formData.budget}
              onChange={(e) => setFormData({ ...formData, budget: Number(e.target.value) })}
              className="w-full p-4 rounded-2xl border border-gray-200 focus:outline-none focus:border-[#5A5A40] bg-[#F5F5F0]/50 text-sm"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-gray-400 font-bold block mb-2">Holidays (Days)</label>
            <input 
              type="number"
              value={formData.holidays}
              onChange={(e) => setFormData({ ...formData, holidays: Number(e.target.value) })}
              className="w-full p-4 rounded-2xl border border-gray-200 focus:outline-none focus:border-[#5A5A40] bg-[#F5F5F0]/50 text-sm"
            />
          </div>
        </div>

        <button 
          onClick={handleDiscover}
          disabled={loading}
          className="w-full bg-[#5A5A40] text-white py-5 rounded-3xl font-medium hover:bg-[#4A4A30] transition-all disabled:opacity-50 flex items-center justify-center gap-3 shadow-lg mb-8"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Compass className="w-5 h-5" />}
          Find My Next Journey
        </button>

        <div className="grid grid-cols-1 gap-6">
          {suggestions.map((s, idx) => (
            <motion.div 
              key={idx}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: idx * 0.1 }}
              className="bg-[#F5F5F0] p-6 rounded-[32px] border border-[#E5E5E0] group hover:border-[#5A5A40] transition-all"
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xl font-serif font-medium text-[#5A5A40]">{s.destination}</h3>
                  <p className="text-xs text-gray-500 mt-1">{s.description}</p>
                </div>
                <div className="text-right">
                  <div className="text-lg font-serif text-[#5A5A40]">₹{s.estimatedBudget}</div>
                  <div className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">{s.duration} Days</div>
                </div>
              </div>
              
              <div className="p-4 bg-white rounded-2xl mb-4">
                <p className="text-xs text-gray-600 leading-relaxed italic">"{s.reason}"</p>
              </div>

              <div className="grid grid-cols-5 gap-2 mb-6">
                {Object.entries(s.budgetBreakdown).map(([key, val]) => (
                  <div key={key} className="text-center">
                    <div className="text-[8px] uppercase tracking-widest text-gray-400 font-bold truncate">{key}</div>
                    <div className="text-[10px] font-bold text-[#5A5A40]">₹{val as number}</div>
                  </div>
                ))}
              </div>

              <button 
                onClick={() => onSelect(s)}
                className="w-full py-3 bg-white border border-[#5A5A40] text-[#5A5A40] rounded-2xl text-sm font-medium hover:bg-[#5A5A40] hover:text-white transition-all"
              >
                Select this Destination
              </button>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

function CreateTripModal({ user, preferences, onClose, initialData }: { user: User, preferences: UserPreference | null, onClose: () => void, initialData?: any }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<TripOptions | null>(null);
  const [selections, setSelections] = useState({
    activities: [] as string[],
    locations: [] as string[],
    routeId: ''
  });
  const [formData, setFormData] = useState({
    destination: initialData?.destination || '',
    startDate: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
    endDate: format(addDays(new Date(), 7 + (initialData?.duration || 7)), 'yyyy-MM-dd'),
    budget: initialData?.budget || 2000,
    groupBudget: 0,
    peopleCount: 1,
    transportType: 'air'
  });

  const handleFetchOptions = async () => {
    if (!preferences) return alert("Please set your preferences first!");
    setLoading(true);
    try {
      const opts = await geminiService.getTripOptions(formData as any, preferences);
      setOptions(opts);
      setStep(2);
    } catch (error) {
      console.error(error);
      alert("Failed to fetch options. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!preferences) return alert("Please set your preferences first!");
    setLoading(true);
    try {
      const weather = await geminiService.getWeatherAdvice(formData.destination, formData.startDate, formData.endDate);
      const itinerary = await geminiService.generateItinerary(formData as any, preferences, selections);
      const budgetResult = await geminiService.optimizeBudget(formData as any, formData.budget * 0.3);
      const advice = await geminiService.getShoppingAndFoodAdvice(formData.destination, preferences);

      await addDoc(collection(db, 'trips'), {
        ...formData,
        userId: user.uid,
        weatherInfo: weather,
        shoppingAdvice: advice.shopping,
        foodAdvice: advice.food,
        itinerary: itinerary,
        costBreakdown: budgetResult.breakdown,
        transportDetails: budgetResult.transportDetails,
        status: 'planning',
        createdAt: serverTimestamp()
      });
      onClose();
    } catch (error) {
      console.error(error);
      alert("Failed to generate trip. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (type: 'activities' | 'locations', id: string) => {
    setSelections(prev => {
      const current = prev[type];
      if (current.includes(id)) {
        return { ...prev, [type]: current.filter(i => i !== id) };
      }
      return { ...prev, [type]: [...current, id] };
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white w-full max-w-2xl rounded-[40px] p-8 shadow-2xl overflow-hidden relative max-h-[90vh] overflow-y-auto"
      >
        <button onClick={onClose} className="absolute top-6 right-6 text-gray-400 hover:text-gray-600">
          <Plus className="w-6 h-6 rotate-45" />
        </button>

        <div className="flex items-center gap-4 mb-8">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${step >= 1 ? 'bg-[#5A5A40] text-white' : 'bg-gray-100 text-gray-400'}`}>1</div>
          <div className={`h-[2px] flex-1 ${step >= 2 ? 'bg-[#5A5A40]' : 'bg-gray-100'}`} />
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${step >= 2 ? 'bg-[#5A5A40] text-white' : 'bg-gray-100 text-gray-400'}`}>2</div>
        </div>

        <h2 className="text-2xl font-serif font-medium text-[#5A5A40] mb-8">
          {step === 1 ? 'Plan New Journey' : 'Customize Your Experience'}
        </h2>

        {step === 1 && (
          <div className="space-y-6">
            <div>
              <label className="text-[10px] uppercase tracking-widest text-gray-400 font-bold block mb-2">Where to?</label>
              <div className="relative">
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input 
                  type="text"
                  placeholder="City, Country"
                  value={formData.destination}
                  onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                  className="w-full pl-12 pr-4 py-4 rounded-2xl border border-gray-200 focus:outline-none focus:border-[#5A5A40] bg-[#F5F5F0]/50"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-bold block mb-2">Start Date</label>
                <input 
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className="w-full p-4 rounded-2xl border border-gray-200 focus:outline-none focus:border-[#5A5A40] bg-[#F5F5F0]/50 text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-bold block mb-2">End Date</label>
                <input 
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  className="w-full p-4 rounded-2xl border border-gray-200 focus:outline-none focus:border-[#5A5A40] bg-[#F5F5F0]/50 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-bold block mb-2">Budget (₹)</label>
                <input 
                  type="number"
                  value={formData.budget}
                  onChange={(e) => setFormData({ ...formData, budget: Number(e.target.value) })}
                  className="w-full p-4 rounded-2xl border border-gray-200 focus:outline-none focus:border-[#5A5A40] bg-[#F5F5F0]/50 text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-bold block mb-2">Group Budget (Optional)</label>
                <input 
                  type="number"
                  value={formData.groupBudget}
                  onChange={(e) => setFormData({ ...formData, groupBudget: Number(e.target.value) })}
                  className="w-full p-4 rounded-2xl border border-gray-200 focus:outline-none focus:border-[#5A5A40] bg-[#F5F5F0]/50 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-bold block mb-2">No. of People</label>
                <input 
                  type="number"
                  min="1"
                  value={formData.peopleCount}
                  onChange={(e) => setFormData({ ...formData, peopleCount: Number(e.target.value) })}
                  className="w-full p-4 rounded-2xl border border-gray-200 focus:outline-none focus:border-[#5A5A40] bg-[#F5F5F0]/50 text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-bold block mb-2">Transport</label>
                <select 
                  value={formData.transportType}
                  onChange={(e) => setFormData({ ...formData, transportType: e.target.value })}
                  className="w-full p-4 rounded-2xl border border-gray-200 focus:outline-none focus:border-[#5A5A40] bg-[#F5F5F0]/50 text-sm"
                >
                  <option value="air">Air</option>
                  <option value="train">Train</option>
                  <option value="bus">Bus</option>
                  <option value="personal vehicle">Personal Vehicle</option>
                  <option value="sea">Sea</option>
                </select>
              </div>
            </div>

            <button 
              onClick={handleFetchOptions}
              disabled={loading || !formData.destination}
              className="w-full bg-[#5A5A40] text-white py-5 rounded-3xl font-medium hover:bg-[#4A4A30] transition-all disabled:opacity-50 flex items-center justify-center gap-3 shadow-lg"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Fetching travel options...</span>
                </>
              ) : (
                <>
                  <TrendingUp className="w-5 h-5" />
                  <span>Next: Choose Activities</span>
                </>
              )}
            </button>
          </div>
        )}

        {step === 2 && options && (
          <div className="space-y-8">
            <section>
              <h3 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-4">Choose Activities</h3>
              <div className="grid grid-cols-1 gap-3">
                {options.activities.map(act => (
                  <button
                    key={act.id}
                    onClick={() => toggleSelection('activities', act.name)}
                    className={`text-left p-4 rounded-2xl border transition-all ${selections.activities.includes(act.name) ? 'border-[#5A5A40] bg-[#5A5A40]/5' : 'border-gray-100 hover:border-gray-200'}`}
                  >
                    <div className="font-medium text-[#5A5A40]">{act.name}</div>
                    <div className="text-xs text-gray-500 mt-1">{act.description}</div>
                    <div className="text-[10px] uppercase tracking-widest text-gray-400 mt-2">{act.category}</div>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h3 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-4">Famous Locations</h3>
              <div className="grid grid-cols-1 gap-3">
                {options.locations.map(loc => (
                  <button
                    key={loc.id}
                    onClick={() => toggleSelection('locations', loc.name)}
                    className={`text-left p-4 rounded-2xl border transition-all ${selections.locations.includes(loc.name) ? 'border-[#5A5A40] bg-[#5A5A40]/5' : 'border-gray-100 hover:border-gray-200'}`}
                  >
                    <div className="font-medium text-[#5A5A40]">{loc.name}</div>
                    <div className="text-xs text-gray-500 mt-1">{loc.description}</div>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h3 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-4">Travel Routes & Stops</h3>
              <div className="grid grid-cols-1 gap-3">
                {options.routes.map(route => (
                  <button
                    key={route.id}
                    onClick={() => setSelections({ ...selections, routeId: route.name })}
                    className={`text-left p-4 rounded-2xl border transition-all ${selections.routeId === route.name ? 'border-[#5A5A40] bg-[#5A5A40]/5' : 'border-gray-100 hover:border-gray-200'}`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="font-medium text-[#5A5A40]">{route.name}</div>
                      <div className="text-xs font-bold text-[#5A5A40]">{route.travelTime}</div>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{route.description}</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {route.stops.map(stop => (
                        <span key={stop} className="text-[10px] bg-gray-100 px-2 py-1 rounded-full text-gray-600">On the way: {stop}</span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <div className="flex gap-4">
              <button 
                onClick={() => setStep(1)}
                className="flex-1 py-5 rounded-3xl font-medium border border-gray-200 hover:bg-gray-50 transition-all"
              >
                Back
              </button>
              <button 
                onClick={handleCreate}
                disabled={loading || selections.activities.length === 0 || !selections.routeId}
                className="flex-[2] bg-[#5A5A40] text-white py-5 rounded-3xl font-medium hover:bg-[#4A4A30] transition-all disabled:opacity-50 flex items-center justify-center gap-3 shadow-lg"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Crafting final itinerary...</span>
                  </>
                ) : (
                  <>
                    <TrendingUp className="w-5 h-5" />
                    <span>Generate Smart Plan</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function TripDetailsModal({ trip, onClose }: { trip: Trip, onClose: () => void }) {
  const [itinerary, setItinerary] = useState<ItineraryDay[]>([]);
  
  useEffect(() => {
    try {
      const parsed = JSON.parse(trip.itinerary || '[]');
      setItinerary(Array.isArray(parsed) ? parsed : []);
    } catch (e) {
      console.error("Failed to parse itinerary", e);
      setItinerary([]);
    }
  }, [trip.itinerary]);

  const [activeView, setActiveView] = useState<'itinerary' | 'budget' | 'weather' | 'advice'>('itinerary');
  const [savingsInput, setSavingsInput] = useState({
    monthly: trip.savingsPerMonth || 0,
    daily: trip.savingsPerDay || 0
  });

  const daysUntilTrip = Math.max(0, differenceInDays(new Date(trip.startDate), new Date()));
  const monthsUntilTrip = Math.max(0, differenceInMonths(new Date(trip.startDate), new Date()));

  const totalNeeded = trip.budget;
  const dailyNeeded = daysUntilTrip > 0 ? Math.ceil(totalNeeded / daysUntilTrip) : totalNeeded;
  const monthlyNeeded = monthsUntilTrip > 0 ? Math.ceil(totalNeeded / monthsUntilTrip) : totalNeeded;

  const handleSaveSavings = async () => {
    await updateDoc(doc(db, 'trips', trip.id!), {
      savingsPerMonth: savingsInput.monthly,
      savingsPerDay: savingsInput.daily
    });
    alert("Savings plan updated!");
  };

  const toggleActivity = async (dayIdx: number, actId: string) => {
    const newItinerary = [...itinerary];
    const day = newItinerary[dayIdx];
    const act = day.activities.find(a => a.id === actId);
    if (act) {
      act.completed = !act.completed;
      setItinerary(newItinerary);
      // Persist to DB
      await updateDoc(doc(db, 'trips', trip.id!), {
        itinerary: JSON.stringify(newItinerary)
      });
    }
  };

  const handleDelete = async () => {
    if (confirm("Delete this trip?")) {
      await deleteDoc(doc(db, 'trips', trip.id!));
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
      <motion.div 
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-[#F5F5F0] w-full max-w-4xl h-[90vh] rounded-[48px] shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="bg-white p-8 border-b border-[#E5E5E0] flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-serif font-medium text-[#5A5A40]">{trip.destination}</h2>
            <p className="text-gray-500 text-sm">{trip.startDate} — {trip.endDate}</p>
          </div>
          <div className="flex gap-3">
            <button onClick={handleDelete} className="p-3 text-gray-400 hover:text-red-500 transition-colors bg-[#F5F5F0] rounded-2xl">
              <Trash2 className="w-5 h-5" />
            </button>
            <button onClick={onClose} className="p-3 text-gray-400 hover:text-gray-600 transition-colors bg-[#F5F5F0] rounded-2xl">
              <Plus className="w-6 h-6 rotate-45" />
            </button>
          </div>
        </div>
        {/* Tabs */}
        <div className="flex px-8 py-4 gap-8 bg-white border-b border-[#E5E5E0] overflow-x-auto no-scrollbar">
          <TabButton active={activeView === 'itinerary'} onClick={() => setActiveView('itinerary')} label="Itinerary" icon={<Calendar />} />
          <TabButton active={activeView === 'budget'} onClick={() => setActiveView('budget')} label="Budget" icon={<Wallet />} />
          <TabButton active={activeView === 'weather'} onClick={() => setActiveView('weather')} label="Weather" icon={<CloudSun />} />
          <TabButton active={activeView === 'advice'} onClick={() => setActiveView('advice')} label="Advice" icon={<History />} />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8">
          {activeView === 'itinerary' && (
            <div className="space-y-12">
              {itinerary?.map((day, dayIdx) => (
                <div key={dayIdx} className="relative pl-8 border-l-2 border-[#5A5A40]/20">
                  <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-[#5A5A40]" />
                  <h3 className="text-xl font-serif font-medium text-[#5A5A40] mb-6">Day {day.day}</h3>
                  <div className="space-y-6">
                    {day.activities?.map((act, i) => (
                      <div 
                        key={`${dayIdx}-${act.id || i}`} 
                        className={cn(
                          "bg-white p-6 rounded-3xl shadow-sm border transition-all flex gap-4 items-start",
                          act.completed ? "opacity-60 border-green-200 bg-green-50/20" : "border-[#E5E5E0]"
                        )}
                      >
                        <button 
                          onClick={() => toggleActivity(dayIdx, act.id)}
                          className={cn(
                            "mt-1 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                            act.completed ? "bg-green-500 border-green-500 text-white" : "border-gray-300 text-transparent"
                          )}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                        <div className="flex-1">
                          <div className="flex justify-between items-start mb-2">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-[#5A5A40] bg-[#5A5A40]/5 px-2 py-1 rounded-md">{act.time}</span>
                            <span className="text-sm font-medium text-gray-600">₹{act.cost}</span>
                          </div>
                          <h4 className={cn("font-medium text-[#1A1A1A] mb-1", act.completed && "line-through")}>{act.description}</h4>
                          {act.location && (
                            <div className="flex items-center gap-1 text-xs text-gray-400">
                              <MapPin className="w-3 h-3" /> {act.location}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {day.notes && (
                    <div className="mt-4 text-sm italic text-gray-500 bg-[#5A5A40]/5 p-4 rounded-2xl">
                      {day.notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {activeView === 'budget' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-8">
                  <div className="bg-white p-8 rounded-[32px] shadow-sm border border-[#E5E5E0]">
                    <h3 className="text-lg font-serif font-medium text-[#5A5A40] mb-6">Cost Breakdown</h3>
                    <div className="space-y-4">
                      <BudgetRow label="Transport" amount={trip.costBreakdown.transport} total={trip.budget} />
                      <BudgetRow label="Stay" amount={trip.costBreakdown.stay} total={trip.budget} />
                      <BudgetRow label="Food" amount={trip.costBreakdown.food} total={trip.budget} />
                      <BudgetRow label="Activities" amount={trip.costBreakdown.activities} total={trip.budget} />
                      <BudgetRow label="Other" amount={trip.costBreakdown.other} total={trip.budget} />
                    </div>
                  </div>

                  <div className="bg-white p-8 rounded-[32px] shadow-sm border border-[#E5E5E0]">
                    <h3 className="text-lg font-serif font-medium text-[#5A5A40] mb-6">Travelers & Group Budget</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-[#F5F5F0] rounded-2xl">
                        <div className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-1">People</div>
                        <div className="text-xl font-serif text-[#5A5A40]">{trip.peopleCount}</div>
                      </div>
                      <div className="p-4 bg-[#F5F5F0] rounded-2xl">
                        <div className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-1">Group Budget</div>
                        <div className="text-xl font-serif text-[#5A5A40]">₹{trip.groupBudget || 0}</div>
                      </div>
                    </div>
                  </div>

                  {/* Savings Planner */}
                  {daysUntilTrip > 0 && (
                    <div className="bg-white p-8 rounded-[32px] shadow-sm border border-[#E5E5E0]">
                      <div className="flex items-center gap-2 mb-6">
                        <PiggyBank className="w-6 h-6 text-[#5A5A40]" />
                        <h3 className="text-lg font-serif font-medium text-[#5A5A40]">Savings Planner</h3>
                      </div>
                      
                      <div className="space-y-6">
                        <div className="p-4 bg-[#F5F5F0] rounded-2xl">
                          <p className="text-xs text-gray-500 mb-2">To reach ₹{totalNeeded} in {daysUntilTrip} days:</p>
                          <div className="flex justify-between items-end">
                            <div>
                              <div className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Daily Goal</div>
                              <div className="text-xl font-serif text-[#5A5A40]">₹{dailyNeeded}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Monthly Goal</div>
                              <div className="text-xl font-serif text-[#5A5A40]">₹{monthlyNeeded}</div>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div>
                            <label className="text-[10px] uppercase tracking-widest text-gray-400 font-bold block mb-2">My Monthly Savings (₹)</label>
                            <input 
                              type="number"
                              value={savingsInput.monthly}
                              onChange={(e) => setSavingsInput({ ...savingsInput, monthly: Number(e.target.value) })}
                              className="w-full p-3 rounded-xl border border-gray-200 focus:outline-none focus:border-[#5A5A40] text-sm"
                            />
                          </div>
                          <button 
                            onClick={handleSaveSavings}
                            className="w-full py-3 bg-[#5A5A40] text-white rounded-xl text-sm font-medium hover:bg-[#4A4A30] transition-all"
                          >
                            Update Savings Goal
                          </button>
                        </div>

                        {savingsInput.monthly > 0 && savingsInput.monthly < monthlyNeeded && (
                          <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl">
                            <div className="flex gap-2 text-amber-800 mb-2">
                              <AlertCircle className="w-4 h-4 mt-0.5" />
                              <span className="text-xs font-bold uppercase tracking-widest">Adjustment Needed</span>
                            </div>
                            <p className="text-xs text-amber-700 leading-relaxed">
                              At ₹{savingsInput.monthly}/month, you'll need {Math.ceil(totalNeeded / savingsInput.monthly)} months to save up. 
                              Consider moving your trip to <strong>{format(addDays(new Date(), Math.ceil(totalNeeded / (savingsInput.monthly / 30))), 'MMMM yyyy')}</strong> or increasing your savings.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-8">
                  <div className="bg-[#5A5A40] p-8 rounded-[32px] text-white">
                    <Wallet className="w-12 h-12 mb-4 opacity-50" />
                    <h3 className="text-3xl font-serif font-medium mb-2">₹{trip.budget}</h3>
                    <p className="text-white/70 text-sm">Total estimated budget for this journey.</p>
                    <div className="mt-8 pt-8 border-t border-white/10">
                      <h4 className="text-xs font-bold uppercase tracking-widest mb-2">Saving Tip</h4>
                      <p className="text-sm italic">"Book your {trip.transportType} tickets at least 3 weeks in advance to save up to 15%."</p>
                    </div>
                  </div>

                  {trip.transportDetails && (
                    <div className="bg-white p-8 rounded-[32px] shadow-sm border border-[#E5E5E0]">
                      <h3 className="text-lg font-serif font-medium text-[#5A5A40] mb-6 capitalize">{trip.transportType} Details</h3>
                      <div className="space-y-4">
                        {(trip.transportType === 'air' || trip.transportType === 'train') && (
                          <>
                            <div className="flex justify-between border-b border-gray-100 pb-2">
                              <span className="text-sm text-gray-500">{trip.transportType === 'air' ? 'Flight' : 'Train'} No.</span>
                              <span className="text-sm font-medium">{trip.transportDetails.flightNumber || trip.transportDetails.trainNumber || 'TBD'}</span>
                            </div>
                            <div className="flex justify-between border-b border-gray-100 pb-2">
                              <span className="text-sm text-gray-500">Departure</span>
                              <span className="text-sm font-medium">{trip.transportDetails.departureTime || 'TBD'}</span>
                            </div>
                            <div className="flex justify-between border-b border-gray-100 pb-2">
                              <span className="text-sm text-gray-500">Arrival</span>
                              <span className="text-sm font-medium">{trip.transportDetails.arrivalTime || 'TBD'}</span>
                            </div>
                            <div className="flex justify-between border-b border-gray-100 pb-2">
                              <span className="text-sm text-gray-500">Booking Ref</span>
                              <span className="text-sm font-medium">{trip.transportDetails.bookingRef || 'TBD'}</span>
                            </div>
                          </>
                        )}
                        {(trip.transportType === 'personal vehicle' || trip.transportType === 'bus') && (
                          <>
                            <div className="flex justify-between border-b border-gray-100 pb-2">
                              <span className="text-sm text-gray-500">Travel Time</span>
                              <span className="text-sm font-medium">{trip.transportDetails.travelTime || 'TBD'}</span>
                            </div>
                            <div className="flex justify-between border-b border-gray-100 pb-2">
                              <span className="text-sm text-gray-500">Est. Tolls</span>
                              <span className="text-sm font-medium">₹{trip.transportDetails.tolls || 0}</span>
                            </div>
                            <div className="flex justify-between border-b border-gray-100 pb-2">
                              <span className="text-sm text-gray-500">Est. Fuel</span>
                              <span className="text-sm font-medium">₹{trip.transportDetails.fuel || 0}</span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeView === 'weather' && (
            <div className="bg-white p-8 rounded-[32px] shadow-sm border border-[#E5E5E0]">
              <div className="flex items-center gap-4 mb-6">
                <CloudSun className="w-10 h-10 text-[#5A5A40]" />
                <h3 className="text-xl font-serif font-medium text-[#5A5A40]">Weather Intelligence</h3>
              </div>
              <div className="prose prose-sm max-w-none text-gray-600">
                <ReactMarkdown>{trip.weatherInfo}</ReactMarkdown>
              </div>
            </div>
          )}

          {activeView === 'advice' && (
            <div className="space-y-8">
              <div className="bg-white p-8 rounded-[32px] shadow-sm border border-[#E5E5E0]">
                <h3 className="text-xl font-serif font-medium text-[#5A5A40] mb-4">Shopping Recommendations</h3>
                <div className="prose prose-sm max-w-none text-gray-600">
                  <ReactMarkdown>{trip.shoppingAdvice || "Generating advice..."}</ReactMarkdown>
                </div>
              </div>
              <div className="bg-white p-8 rounded-[32px] shadow-sm border border-[#E5E5E0]">
                <h3 className="text-xl font-serif font-medium text-[#5A5A40] mb-4">Food & Provisions</h3>
                <div className="prose prose-sm max-w-none text-gray-600">
                  <ReactMarkdown>{trip.foodAdvice || "Generating advice..."}</ReactMarkdown>
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function TabButton({ active, onClick, label, icon }: { active: boolean, onClick: () => void, label: string, icon: React.ReactNode }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 pb-4 border-b-2 transition-all text-sm font-medium",
        active ? "border-[#5A5A40] text-[#5A5A40]" : "border-transparent text-gray-400 hover:text-gray-600"
      )}
    >
      {React.isValidElement(icon) && React.cloneElement(icon as React.ReactElement<any>, { className: "w-4 h-4" })}
      {label}
    </button>
  );
}

function BudgetRow({ label, amount, total }: { label: string, amount: number, total: number }) {
  const percentage = (amount / total) * 100;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium text-[#5A5A40]">₹{amount}</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          className="h-full bg-[#5A5A40]"
        />
      </div>
    </div>
  );
}
