/** Existing SSR fixtures model an anonymous, private collector. */
import { emptySeason } from "../src/data/seasonCatalog";
export const collectorFixtureDefaults = () => ({
  season: emptySeason(0),
  account: null,
  collector: { profile: { displayName: "Student", bio: "", isPublic: false, featuredItemIds: [] as string[] }, copies: [], discoveredItemIds: [] as string[] },
  authError: null, authAction: async () => false, updateProfile: async () => false,
  setCopyLock: async () => false, setWishlist: async () => false,
});
