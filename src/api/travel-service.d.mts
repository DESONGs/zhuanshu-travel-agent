export class TravelService {
  constructor(options?: Record<string, unknown>);
  createTrip(input?: Record<string, unknown>): Promise<Record<string, unknown>>;
  updateTripScope(input?: Record<string, unknown>): Promise<Record<string, unknown>>;
  getTripControlView(tripId: string): Promise<Record<string, unknown>>;
  getTripPlanView(tripId: string): Promise<Record<string, unknown>>;
  getOpenDecisions(tripId: string): Promise<Record<string, unknown>>;
  researchTripOptions(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  proposeTripChange(input: Record<string, unknown>, actor?: string): Promise<Record<string, unknown>>;
  acceptTripChange(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  rejectTripChange(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  prepareBookingHandoff(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  recordBookingConfirmation(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  reportTripDisruption(input: Record<string, unknown>, actor?: string): Promise<Record<string, unknown>>;
  submitTripFeedback(input: Record<string, unknown>, actor?: string): Promise<Record<string, unknown>>;
}
