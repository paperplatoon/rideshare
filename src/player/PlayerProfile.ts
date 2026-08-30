export class PlayerProfile {
  money = 0;
  completedRides = 0;

  completeRide(earnings: number): void {
    this.money += earnings;
    this.completedRides += 1;
  }

  spend(requestedAmount: number): number {
    const spent = Math.min(Math.max(0, requestedAmount), this.money);
    this.money -= spent;
    return spent;
  }
}
