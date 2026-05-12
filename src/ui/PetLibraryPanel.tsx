import { MAX_PETS, type PetLibrary } from "../domain/petLibrary";
import type { InstalledPet } from "../domain/petConfig";
import { hatchingBridge } from "../hatchingBridge";

export function PetLibraryPanel({
  library,
  pets,
  onSwitch,
  onHatch,
  onImport,
  onArchive = hatchingBridge.archivePet,
}: {
  library: PetLibrary;
  pets: InstalledPet[];
  onSwitch: (petId: string) => void;
  onHatch: () => void;
  onImport: () => void;
  onArchive?: (petId: string) => Promise<void> | void;
}) {
  const atLimit = library.pets.length >= MAX_PETS;
  const activePet = pets.find((pet) => pet.id === library.activePetId);

  function archive(pet: InstalledPet) {
    const confirmed = window.confirm(
      `Archive ${pet.displayName}? This moves the package out of the library. You can hatch again.`,
    );
    if (!confirmed) return;
    void onArchive(pet.id);
  }

  return (
    <section className="pet-library-panel" aria-label="Pet library">
      <header>
        <h2>Pet library</h2>
        <span>
          {library.pets.length} / {MAX_PETS}
        </span>
      </header>
      <div className="pet-library-list">
        {pets.map((pet) => {
          const active = pet.id === library.activePetId;
          return (
            <div key={pet.id} className="pet-library-card">
              <button type="button" disabled={active} onClick={() => onSwitch(pet.id)}>
                <span>{pet.displayName}</span>
                {active ? <small>Active</small> : <small>Switch</small>}
              </button>
              <button type="button" disabled={active} onClick={() => archive(pet)}>
                Archive
              </button>
              {active ? (
                <small>
                  Switch pets first — {activePet?.displayName ?? pet.displayName} is currently
                  active.
                </small>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="pet-library-actions">
        <button type="button" disabled={atLimit} onClick={onHatch}>
          Hatch pet
        </button>
        <button type="button" disabled={atLimit} onClick={onImport}>
          Import pet
        </button>
      </div>
      {atLimit ? (
        <p>Pet library is full. Remove or archive a pet before importing another.</p>
      ) : null}
    </section>
  );
}
