import { MAX_PETS, type PetLibrary } from "../domain/petLibrary";
import type { InstalledPet } from "../domain/petConfig";

export function PetLibraryPanel({
  library,
  pets,
  onSwitch,
  onHatch,
  onImport,
}: {
  library: PetLibrary;
  pets: InstalledPet[];
  onSwitch: (petId: string) => void;
  onHatch: () => void;
  onImport: () => void;
}) {
  const atLimit = library.pets.length >= MAX_PETS;
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
            <button key={pet.id} type="button" disabled={active} onClick={() => onSwitch(pet.id)}>
              <span>{pet.displayName}</span>
              {active ? <small>Active</small> : <small>Switch</small>}
            </button>
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
