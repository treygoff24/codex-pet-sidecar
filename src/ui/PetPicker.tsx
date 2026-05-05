import type { InstalledPet } from "../domain/petConfig";

export function PetPicker({ pets, onPick }: { pets: InstalledPet[]; onPick: (pet: InstalledPet) => void }) {
  return (
    <section className="pet-picker" aria-label="Pick a Codex pet">
      <h1>Choose your tiny sidekick</h1>
      {pets.length === 0 ? <p>No Codex pets found in your Codex pets folder.</p> : null}
      <div className="pet-picker-grid">
        {pets.map((pet) => (
          <button key={pet.id} type="button" onClick={() => onPick(pet)}>
            <span>{pet.displayName}</span>
            {pet.description ? <small>{pet.description}</small> : null}
          </button>
        ))}
      </div>
    </section>
  );
}
