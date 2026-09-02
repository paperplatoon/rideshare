export type MissionLicenseId = "rideshare" | "taxi" | "rideshare_silver";

export interface MissionLicenseDefinition {
  id: MissionLicenseId;
  name: string;
  tabLabel: string;
  description: string;
  unlockCost: number;
  fareMultiplier: number;
  maxTipPercent?: number;
  violationTipPenaltyMultiplier?: number;
  activityType: "passengerRide";
  offerSeed: number;
}

export const MISSION_LICENSES: readonly MissionLicenseDefinition[] = [
  {
    id: "rideshare",
    name: "Rideshare",
    tabLabel: "RIDESHARE",
    description: "Standard passenger rides with regular fares.",
    unlockCost: 0,
    fareMultiplier: 1,
    activityType: "passengerRide",
    offerSeed: 7419,
  },
  {
    id: "taxi",
    name: "Taxi",
    tabLabel: "TAXI",
    description: "Unlock taxi jobs paying twice the standard base fare.",
    unlockCost: 500,
    fareMultiplier: 2,
    activityType: "passengerRide",
    offerSeed: 14839,
  },
  {
    id: "rideshare_silver",
    name: "Rideshare Silver",
    tabLabel: "RIDESHARE SILVER",
    description: "Premium rides with triple base fares and larger tips, but strict driving standards.",
    unlockCost: 3000,
    fareMultiplier: 3,
    maxTipPercent: 0.65,
    violationTipPenaltyMultiplier: 4,
    activityType: "passengerRide",
    offerSeed: 22259,
  },
];

const LICENSES_BY_ID = new Map(MISSION_LICENSES.map((license) => [license.id, license]));

export function getMissionLicense(id: string): MissionLicenseDefinition | null {
  return LICENSES_BY_ID.get(id as MissionLicenseId) ?? null;
}
