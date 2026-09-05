import { GAME_CONFIG } from "../game/config";
import { PassengerType } from "../game/types";
import { pickWeighted } from "../utils/math";

export const PASSENGER_ARCHETYPES = {
  timid: { type: PassengerType.Timid, name: "Timid", text: "Must drive below 50 mph" },
  hurried: { type: PassengerType.Hurried, name: "Hurried", text: "Must drive above 25 mph" },
  lawful: { type: PassengerType.Lawful, name: "Lawful", text: "Must stop for red lights" },
  careful: { type: PassengerType.Careful, name: "Careful", text: "No U-turns" },
  shady: { type: PassengerType.Shady, name: "Shady", text: "No police attention whatsoever" },
  thrillSeeker: { type: PassengerType.ThrillSeeker, name: "Thrill-seeker", text: "Extra $20 if you blow a yellow light" },
  mechanic: { type: PassengerType.Mechanic, name: "Mechanic", text: "Free car repair for waived fare" },
  lawyer: { type: PassengerType.Lawyer, name: "Lawyer", text: "No fines if arrested" },
  offDutyCop: { type: PassengerType.OffDutyCop, name: "Off-duty cop", text: "Get Out of Jail Free card if you earn five stars" },
  carSalesman: { type: PassengerType.CarSalesman, name: "Car Salesman", text: "$100 off next car purchase" },
  millionaire: { type: PassengerType.Millionaire, name: "Millionaire", text: "3x higher tip, but lower ratings" },
  serviceWorker: { type: PassengerType.ServiceWorker, name: "Fellow service worker", text: "1/2 tip, but much higher ratings" },
  offGrid: { type: PassengerType.OffGrid, name: "Off-grid", text: "Extra $20 if you stop at a gas station" },
  normal: { type: PassengerType.Normal, name: "", text: "" },
} as const;

const byType = new Map<PassengerType, { name: string; text: string }>(
  Object.values(PASSENGER_ARCHETYPES).map((definition) => [definition.type, definition]),
);

export function passengerArchetype(type: PassengerType): { name: string; text: string } {
  return byType.get(type) ?? { name: type, text: "" };
}

export function pickPassengerType(rng: () => number): PassengerType {
  return PASSENGER_ARCHETYPES[pickWeighted(rng, GAME_CONFIG.ride.archetypes.weights)].type;
}
