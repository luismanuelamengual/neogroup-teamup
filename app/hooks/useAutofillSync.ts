'use client'

import { useEffect, useRef } from 'react'

/**
 * Chrome/Safari a veces completan un input directamente en el DOM (autocompletado de
 * usuario/contraseña) sin disparar los eventos que React usa para actualizar el estado.
 * En un MUI TextField controlado, esto hace que el label nunca se entere de que el campo
 * tiene contenido y quede superpuesto sobre el valor autocompletado.
 *
 * Este hook devuelve un ref para colgar del `inputRef` del TextField y, poco después del
 * montaje, revisa si el navegador cargó un valor y lo sincroniza al estado de React.
 */
export function useAutofillSync<T extends HTMLInputElement = HTMLInputElement>(onAutofill: (value: string) => void) {
  const inputRef = useRef<T>(null)

  useEffect(() => {
    const sync = () => {
      const value = inputRef.current?.value

      if (value) {
        onAutofill(value)
      }
    }

    // Varios intentos escalonados: el autocompletado no siempre está disponible en el primer render.
    const timers = [50, 150, 300, 600].map((delay) => window.setTimeout(sync, delay))

    return () => timers.forEach(window.clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return inputRef
}
