/** Existing SSR fixtures model an anonymous, private collector. */
export const collectorFixtureDefaults = () => ({
  account: null,
  collector: { profile: { displayName: "Student", bio: "", isPublic: false, featuredItemIds: [] as string[] }, copies: [], discoveredItemIds: [] as string[] },
  authError: null, authAction: async () => false, updateProfile: async () => false,
});
