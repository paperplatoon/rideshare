import { GAME_CONFIG } from "../game/config";

export type MissionLicenseId = "rideshare" | "taxi" | "rideshare_silver" | "package_delivery";

export interface MissionLicenseDefinition {
  id: MissionLicenseId;
  name: string;
  tabLabel: string;
  description: string;
  unlockCost: number;
  fareMultiplier: number;
  maxTipPercent?: number;
  violationTipPenaltyMultiplier?: number;
  activityType: "passengerRide" | "packageDelivery";
  unlockLocation: "phone" | "pause";
  offerSeed: number;
}

export const MISSION_LICENSES: readonly MissionLicenseDefinition[] = [
  {
    id: "rideshare",
    name: "Rideshare",
    tabLabel: "RIDE",
    description: "Standard passenger rides with regular fares.",
    unlockCost: GAME_CONFIG.progression.missionLicenseUnlockCosts.rideshare,
    fareMultiplier: 1,
    activityType: "passengerRide",
    unlockLocation: "phone",
    offerSeed: 7419,
  },
  {
    id: "taxi",
    name: "Taxi",
    tabLabel: "TAXI",
    description: "Unlock taxi jobs paying twice the standard base fare.",
    unlockCost: GAME_CONFIG.progression.missionLicenseUnlockCosts.taxi,
    fareMultiplier: 2,
    activityType: "passengerRide",
    unlockLocation: "phone",
    offerSeed: 14839,
  },
  {
    id: "rideshare_silver",
    name: "Rideshare Silver",
    tabLabel: "SILVER",
    description: "Premium rides with triple base fares and larger tips, but strict driving standards.",
    unlockCost: GAME_CONFIG.progression.missionLicenseUnlockCosts.rideshare_silver,
    fareMultiplier: 3,
    maxTipPercent: 0.65,
    violationTipPenaltyMultiplier: 4,
    activityType: "passengerRide",
    unlockLocation: "phone",
    offerSeed: 22259,
  },
  {
    id: "package_delivery",
    name: "Package Delivery",
    tabLabel: "PACKAGE",
    description: "Time-sensitive package deliveries with rapidly declining payouts.",
    unlockCost: GAME_CONFIG.progression.missionLicenseUnlockCosts.package_delivery,
    fareMultiplier: 1,
    activityType: "packageDelivery",
    unlockLocation: "pause",
    offerSeed: GAME_CONFIG.packageDelivery.offerSeed,
  },
];

const LICENSES_BY_ID = new Map(MISSION_LICENSES.map((license) => [license.id, license]));

export function getMissionLicense(id: string): MissionLicenseDefinition | null {
  return LICENSES_BY_ID.get(id as MissionLicenseId) ?? null;
}
