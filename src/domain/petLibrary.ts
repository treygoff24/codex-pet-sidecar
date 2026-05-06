export const MAX_PETS = 20;

export type PetSource =
  | { type: "bundled"; bundledId: string }
  | { type: "user_created"; createdBy: string }
  | { type: "imported"; originalPath?: string }
  | { type: "migrated"; migrationId: string };

export type PetLibraryEntry = {
  petId: string;
  displayName: string;
  source: PetSource;
  createdAt: string;
  updatedAt: string;
};

export type PetLibrary = {
  activePetId?: string;
  pets: PetLibraryEntry[];
};
