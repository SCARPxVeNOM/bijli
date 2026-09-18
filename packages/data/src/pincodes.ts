/** Small demo lookup table: pincode -> location, used to geocode for the weather
 * API and to pick the applicable state's tariff plan. Extend as needed; this is
 * intentionally not a full pincode database. */
export interface PincodeInfo {
  pincode: string;
  state: string;
  city: string;
  lat: number;
  lon: number;
}

export const PINCODES: PincodeInfo[] = [
  { pincode: "400001", state: "Maharashtra", city: "Mumbai", lat: 18.9322, lon: 72.8264 },
  { pincode: "411001", state: "Maharashtra", city: "Pune", lat: 18.5196, lon: 73.8553 },
  { pincode: "110001", state: "Delhi", city: "New Delhi", lat: 28.6339, lon: 77.2245 },
  { pincode: "110034", state: "Delhi", city: "Delhi", lat: 28.7196, lon: 77.1652 },
];

export function lookupPincode(pincode: string): PincodeInfo | undefined {
  return PINCODES.find((p) => p.pincode === pincode);
}

/** Falls back to the first demo pincode in the matching state (or overall first)
 * so an unknown pincode still produces a usable demo instead of failing. */
export function resolvePincode(pincode: string): PincodeInfo {
  return lookupPincode(pincode) ?? PINCODES[0];
}
