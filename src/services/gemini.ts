import { GoogleGenAI, Type } from "@google/genai";
import { Trip, UserPreference, ItineraryDay, TripOptions, AISuggestedTrip } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

const SYSTEM_INSTRUCTION = `
You are a precise travel itinerary generator. 
CRITICAL: Output ONLY valid, minified JSON. 
DO NOT include any conversational text, markdown formatting (unless specifically requested in a field), or repetitive descriptions.
If a day has many activities, summarize them to keep the total response length within limits.
DO NOT repeat the same activity description multiple times.
STRICTLY AVOID repetitive phrases or looping text. Keep all descriptions and notes concise (max 200 characters per field).
Ensure all JSON strings are properly closed and all array elements are separated by commas.
`;

const cleanJson = (text: string): string => {
  // Remove markdown code blocks if present
  let cleaned = text.replace(/```json\n?|```/g, "").trim();
  
  // Find the first [ or { and the last ] or }
  const startIdx = Math.min(
    cleaned.indexOf("[") === -1 ? Infinity : cleaned.indexOf("["),
    cleaned.indexOf("{") === -1 ? Infinity : cleaned.indexOf("{")
  );
  const endIdx = Math.max(
    cleaned.lastIndexOf("]"),
    cleaned.lastIndexOf("}")
  );
  
  if (startIdx !== Infinity && endIdx !== -1 && endIdx > startIdx) {
    let result = cleaned.substring(startIdx, endIdx + 1);
    
    // Fix common malformations
    // 1. Missing commas between objects/arrays: } { -> }, {
    result = result.replace(/}\s*{/g, '}, {');
    result = result.replace(/]\s*\[/g, '], [');
    result = result.replace(/}\s*\[/g, '}, [');
    result = result.replace(/]\s*{/g, '], {');
    
    // 2. Remove trailing commas before closing braces/brackets
    result = result.replace(/,\s*([\]}])/g, '$1');
    
    // 3. Fix invalid numeric values
    result = result.replace(/:\s*NaN/g, ': null');
    result = result.replace(/:\s*Infinity/g, ': null');
    result = result.replace(/:\s*-Infinity/g, ': null');
    
    return result;
  }
  return cleaned;
};

const withRetry = async <T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> => {
  try {
    return await fn();
  } catch (error: any) {
    const isRateLimit = error.status === 429 || error.message?.includes('429') || error.message?.includes('RESOURCE_EXHAUSTED');
    const isJsonError = error instanceof SyntaxError || error.message?.includes('JSON');
    
    if (retries > 0 && (isRateLimit || isJsonError)) {
      console.warn(`Gemini error (${isRateLimit ? 'Rate limit' : 'JSON syntax'}), retrying in ${delay}ms... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRetry(fn, retries - 1, delay * 1.5);
    }
    throw error;
  }
};

export const geminiService = {
  async getTripOptions(trip: Partial<Trip>, preferences: UserPreference): Promise<TripOptions> {
    const prompt = `
      Act as a professional travel agent. Suggest multiple options for a trip to ${trip.destination}.
      Trip Details:
      - Dates: ${trip.startDate} to ${trip.endDate}
      - Budget: ₹${trip.budget}
      - People: ${trip.peopleCount}
      - Transport: ${trip.transportType}
      - Interests: ${preferences.interests.join(", ")}

      Provide:
      1. A list of 8-10 activities (name, description, category).
      2. A list of 5-6 famous locations/landmarks.
      3. A list of 3 potential travel routes or transportation plans, including estimated travel time, the route description, and interesting places that can be visited DURING the travel (on the way).

      Return a JSON object with keys: "activities", "locations", "routes".
    `;

    return withRetry(async () => {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          maxOutputTokens: 2048,
          temperature: 0.7,
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              activities: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    name: { type: Type.STRING },
                    description: { type: Type.STRING },
                    category: { type: Type.STRING }
                  }
                }
              },
              locations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    name: { type: Type.STRING },
                    description: { type: Type.STRING }
                  }
                }
              },
              routes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    name: { type: Type.STRING },
                    description: { type: Type.STRING },
                    stops: { type: Type.ARRAY, items: { type: Type.STRING } },
                    travelTime: { type: Type.STRING }
                  }
                }
              }
            }
          }
        }
      });
      return JSON.parse(cleanJson(response.text));
    });
  },

  async generateItinerary(trip: Partial<Trip>, preferences: UserPreference, selections: { activities: string[], locations: string[], routeId: string }): Promise<string> {
    const prompt = `
      Act as a professional travel agent. Generate a concise day-by-day itinerary for a trip to ${trip.destination}.
      Trip Details:
      - Dates: ${trip.startDate} to ${trip.endDate}
      - Budget: ₹${trip.budget}
      - People: ${trip.peopleCount}
      - Preferred Transport: ${trip.transportType}
      - User Preferences: ${preferences.budgetLevel} budget, interests in ${preferences.interests.join(", ")}.

      User Selections:
      - Selected Activities: ${selections.activities.join(", ")}
      - Selected Locations: ${selections.locations.join(", ")}
      - Selected Route/Transport Plan ID: ${selections.routeId}

      Requirements:
      1. Provide a JSON array of objects, each representing a day.
      2. Each day should have: "day" (number), "activities" (array of {id, time, description, location, cost}), and "notes".
      3. For the travel days, plan the travel time, the route, and include visits to the "on the way" stops suggested in the selected route.
      4. Ensure the total cost fits within the ₹${trip.budget} budget.
      5. Generate plans for ALL days from ${trip.startDate} to ${trip.endDate}.
      6. Keep descriptions brief to avoid truncation.
    `;

    return withRetry(async () => {
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          maxOutputTokens: 4096, // Reduced from 8192 to prevent massive garbage output
          temperature: 0.7, // Slightly lower to reduce hallucination/looping
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                day: { type: Type.NUMBER },
                activities: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      time: { type: Type.STRING },
                      description: { type: Type.STRING, description: "Max 150 chars" },
                      location: { type: Type.STRING },
                      cost: { type: Type.NUMBER }
                    }
                  }
                },
                notes: { type: Type.STRING, description: "Max 200 chars, concise travel tips only" }
              }
            }
          }
        }
      });
      
      const cleaned = cleanJson(response.text);
      try {
        JSON.parse(cleaned); // Validate
        return cleaned;
      } catch (e) {
        console.error("Gemini returned invalid JSON for itinerary:", cleaned);
        throw new Error("Failed to generate a valid itinerary. Please try again.");
      }
    });
  },

  async getShoppingAndFoodAdvice(destination: string, preferences: UserPreference): Promise<{ shopping: string, food: string }> {
    const prompt = `
      Provide travel recommendations for ${destination} based on interests: ${preferences.interests.join(", ")}.
      1. Shopping: What to buy there (local specialties) and what to bring from home.
      2. Food: Must-try local dishes and food items to carry for the journey.
      Return a JSON object with keys "shopping" and "food" containing markdown strings.
    `;

    return withRetry(async () => {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          maxOutputTokens: 2048,
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              shopping: { type: Type.STRING },
              food: { type: Type.STRING }
            }
          }
        }
      });
      return JSON.parse(cleanJson(response.text));
    });
  },

  async getWeatherAdvice(destination: string, startDate: string, endDate: string): Promise<string> {
    return withRetry(async () => {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `What is the typical weather in ${destination} between ${startDate} and ${endDate}? Provide a concise summary and packing advice.`,
        config: {
          tools: [{ googleSearch: {} }],
          maxOutputTokens: 1024
        }
      });
      return response.text;
    });
  },

  async suggestLocations(preferences: UserPreference): Promise<string[]> {
    const prompt = `Based on these travel interests: ${preferences.interests.join(", ")}, suggest 5 unique travel destinations worldwide. Return only a JSON array of strings.`;
    return withRetry(async () => {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          maxOutputTokens: 512,
          responseSchema: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        }
      });
      return JSON.parse(cleanJson(response.text));
    });
  },

  async optimizeBudget(trip: Trip, transportCost: number): Promise<{ breakdown: Trip['costBreakdown'], transportDetails: Trip['transportDetails'] }> {
    const prompt = `
      A user is planning a trip to ${trip.destination} with a total budget of ₹${trip.budget}.
      The transport cost has been estimated at ₹${transportCost}.
      User preferences: ${trip.transportType} transport, ${trip.peopleCount} people.
      
      Calculate a balanced cost breakdown for:
      - transport: ${transportCost}
      - stay
      - food
      - activities
      - other
      
      Also, generate realistic ${trip.transportType} details:
      - If air/train: Suggest a flight/train number, departure/arrival times, and a placeholder booking reference.
      - If personal vehicle/bus: Suggest estimated travel time, estimated tolls, and estimated fuel costs.

      Return a JSON object with:
      "breakdown": { transport, stay, food, activities, other, tolls, fuel },
      "transportDetails": { flightNumber, trainNumber, departureTime, arrivalTime, bookingRef, travelTime, tolls, fuel }
    `;

    return withRetry(async () => {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          maxOutputTokens: 2048,
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              breakdown: {
                type: Type.OBJECT,
                properties: {
                  transport: { type: Type.NUMBER },
                  stay: { type: Type.NUMBER },
                  food: { type: Type.NUMBER },
                  activities: { type: Type.NUMBER },
                  other: { type: Type.NUMBER },
                  tolls: { type: Type.NUMBER },
                  fuel: { type: Type.NUMBER }
                }
              },
              transportDetails: {
                type: Type.OBJECT,
                properties: {
                  flightNumber: { type: Type.STRING },
                  trainNumber: { type: Type.STRING },
                  departureTime: { type: Type.STRING },
                  arrivalTime: { type: Type.STRING },
                  bookingRef: { type: Type.STRING },
                  travelTime: { type: Type.STRING },
                  tolls: { type: Type.NUMBER },
                  fuel: { type: Type.NUMBER }
                }
              }
            }
          }
        }
      });
      return JSON.parse(cleanJson(response.text));
    });
  },

  async suggestTripsByBudget(location: string, budget: number, holidays: number, preferences: UserPreference): Promise<AISuggestedTrip[]> {
    const prompt = `
      Act as a travel discovery engine.
      User Location: ${location}
      Budget: ₹${budget}
      Duration: ${holidays} days
      Interests: ${preferences.interests.join(", ")}

      Suggest 3-4 destinations that fit this budget and duration starting from ${location}.
      For each destination, provide:
      - destination name
      - short description
      - estimated total budget (should be close to or less than ₹${budget})
      - duration (should be ${holidays})
      - reason why it fits the user's interests
      - a high-level budget breakdown (transport, stay, activities, food, other)

      Return a JSON array of AISuggestedTrip objects.
    `;

    return withRetry(async () => {
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          maxOutputTokens: 2048,
          temperature: 0.7,
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                destination: { type: Type.STRING },
                description: { type: Type.STRING },
                estimatedBudget: { type: Type.NUMBER },
                duration: { type: Type.NUMBER },
                reason: { type: Type.STRING },
                budgetBreakdown: {
                  type: Type.OBJECT,
                  properties: {
                    transport: { type: Type.NUMBER },
                    stay: { type: Type.NUMBER },
                    activities: { type: Type.NUMBER },
                    food: { type: Type.NUMBER },
                    other: { type: Type.NUMBER }
                  },
                  required: ["transport", "stay", "activities", "food", "other"]
                }
              },
              required: ["destination", "description", "estimatedBudget", "duration", "reason", "budgetBreakdown"]
            }
          }
        }
      });
      return JSON.parse(cleanJson(response.text));
    });
  }
};
