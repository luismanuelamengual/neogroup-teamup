'use client'

import { useEffect, useRef } from 'react'

const STYLE_ID = 'autofill-sync-detect-style'

// Regla global (inyectada una sola vez) que le pone una animación de duración ínfima a
// cualquier input autocompletado por el navegador. Eso permite escuchar `animationstart`
// y enterarnos en el instante exacto en que Chrome/Safari aplican (o quitan) el autofill,
// sin depender de temporizadores a ciegas.
function ensureDetectionStyleInjected() {
  if (document.getElementById(STYLE_ID)) {
    return
  }

  const style = document.createElement('style')

  style.id = STYLE_ID
  style.textContent = `
    @keyframes autofill-sync-detect { from {} to {} }
    input:-webkit-autofill { animation-name: autofill-sync-detect; animation-duration: 0.001s; }
    input:autofill { animation-name: autofill-sync-detect; animation-duration: 0.001s; }
  `
  document.head.appendChild(style)
}

/**
 * Chrome/Safari a veces completan un input directamente en el DOM (autocompletado de
 * usuario/contraseña) sin disparar los eventos que React usa para actualizar el estado.
 * En un MUI TextField controlado, esto hace que el label nunca se entere de que el campo
 * tiene contenido y quede superpuesto sobre el valor autocompletado.
 *
 * La versión anterior solo reintentaba con `setTimeout` fijos tras el montaje, por lo que
 * fallaba si el autofill llegaba más tarde (gestor de contraseñas externo, el usuario
 * vuelve a la pestaña, autofill diferido). Esta versión combina varias señales en paralelo:
 *
 * 1. `animationstart` sobre `:autofill`/`:-webkit-autofill`: detecta el autofill de
 *    Chrome/Safari en el momento exacto en que ocurre, sin límite de tiempo.
 * 2. `input`/`change` nativos: cubren Firefox y cualquier autocompletado que sí notifique.
 * 3. `focus`/`visibilitychange`/`pageshow`: cubren gestores de contraseñas externos que
 *    completan el campo mientras el usuario está en otra pestaña/ventana o vuelve por bfcache.
 *
 * Devuelve un ref para colgar del `inputRef` del TextField.
 */
export function useAutofillSync<T extends HTMLInputElement = HTMLInputElement>(onAutofill: (value: string) => void) {
  const inputRef = useRef<T>(null)
  const onAutofillRef = useRef(onAutofill)
  const lastSyncedValue = useRef<string | null>(null)

  useEffect(() => {
    onAutofillRef.current = onAutofill
  })

  useEffect(() => {
    const node = inputRef.current

    if (!node) {
      return
    }

    ensureDetectionStyleInjected()

    const sync = () => {
      const value = inputRef.current?.value

      if (value && value !== lastSyncedValue.current) {
        lastSyncedValue.current = value
        onAutofillRef.current(value)
      }
    }

    const handleAnimationStart = (event: AnimationEvent) => {
      if (event.animationName === 'autofill-sync-detect') {
        sync()
      }
    }

    node.addEventListener('animationstart', handleAnimationStart)
    node.addEventListener('input', sync)
    node.addEventListener('change', sync)
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('pageshow', sync)
    window.addEventListener('focus', sync)

    return () => {
      node.removeEventListener('animationstart', handleAnimationStart)
      node.removeEventListener('input', sync)
      node.removeEventListener('change', sync)
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('pageshow', sync)
      window.removeEventListener('focus', sync)
    }
  }, [])

  return inputRef
}
