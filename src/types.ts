export type BudgetLevel = 'budget' | 'moderate' | 'luxury';

export interface UserPreference {
  id?: string;
  userId: string;
  budgetLevel: BudgetLevel;
  transportPreference: string[];
  stayPreference: string;
  interests: string[];
  updatedAt: any;
}

export interface CostBreakdown {
  transport: number;
  stay: number;
  activities: number;
  food: number;
  other: number;
  tolls?: number;
  fuel?: number;
}

export interface TransportDetails {
  flightNumber?: string;
  trainNumber?: string;
  departureTime?: string;
  arrivalTime?: string;
  bookingRef?: string;
  travelTime?: string;
  tolls?: number;
  fuel?: number;
}

export interface Trip {
  id?: string;
  userId: string;
  destination: string;
  startDate: string;
  endDate: string;
  budget: number;
  groupBudget?: number;
  peopleCount: number;
  transportType: string;
  itinerary: string; // JSON string
  weatherInfo: string;
  shoppingAdvice?: string;
  foodAdvice?: string;
  costBreakdown: CostBreakdown;
  transportDetails?: TransportDetails;
  status: 'planning' | 'confirmed' | 'completed';
  createdAt: any;
  savingsPerMonth?: number;
  savingsPerDay?: number;
}

export interface AISuggestedTrip {
  destination: string;
  description: string;
  estimatedBudget: number;
  duration: number;
  reason: string;
  budgetBreakdown: CostBreakdown;
}

export interface TripOptions {
  activities: { id: string; name: string; description: string; category: string }[];
  locations: { id: string; name: string; description: string }[];
  routes: { id: string; name: string; description: string; stops: string[]; travelTime: string }[];
}

export interface ItineraryDay {
  day: number;
  activities: {
    id: string;
    time: string;
    description: string;
    location?: string;
    cost?: number;
    completed?: boolean;
  }[];
  notes?: string;
}
