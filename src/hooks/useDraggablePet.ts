import { useCallback, useState } from "react";

export type PetPosition = { x: number; y: number };

export function clampPetPosition(position: PetPosition, bounds: { width: number; height: number }, pet: { width: number; height: number }): PetPosition {
  return {
    x: Math.min(Math.max(position.x, 0), Math.max(bounds.width - pet.width, 0)),
    y: Math.min(Math.max(position.y, 28), Math.max(bounds.height - pet.height - 64, 28)),
  };
}

export function useDraggablePet(initial: PetPosition = { x: 36, y: 48 }) {
  const [position, setPosition] = useState(initial);
  const moveBy = useCallback((dx: number, dy: number) => {
    setPosition((current) => clampPetPosition({ x: current.x + dx, y: current.y + dy }, { width: window.innerWidth, height: window.innerHeight }, { width: 192, height: 208 }));
  }, []);

  return { position, moveBy, setPosition };
}
