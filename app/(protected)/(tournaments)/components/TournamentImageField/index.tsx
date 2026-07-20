'use client'

import './index.scss'
import AddPhotoAlternateOutlinedIcon from '@mui/icons-material/AddPhotoAlternateOutlined'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { ChangeEvent, useRef, useState } from 'react'
import { useNotifications } from '@/app/hooks/useNotifications'
import { compressImageToDataUrl, IMAGE_FILE_ACCEPT } from '../../utils/image'

const ERROR_MESSAGES: Record<string, string> = {
  invalidImage: 'El archivo seleccionado no es una imagen válida',
  imageTooLarge: 'La imagen es demasiado pesada. Elegí una de hasta 20MB'
}

interface TournamentImageFieldProps {
  value: string | null
  onChange: (value: string | null) => void
  disabled?: boolean
}

/** Poster/banner picture picker: preview, change and remove for a tournament. */
export default function TournamentImageField({ value, onChange, disabled = false }: TournamentImageFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { showErrorMessage } = useNotifications()
  const [processing, setProcessing] = useState(false)

  const handlePick = () => {
    if (!disabled && !processing) {
      inputRef.current?.click()
    }
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null

    event.target.value = ''

    if (!file) {
      return
    }

    setProcessing(true)

    try {
      const dataUrl = await compressImageToDataUrl(file)

      onChange(dataUrl)
    } catch (error) {
      const code = error instanceof Error ? error.message : 'invalidImage'

      showErrorMessage(ERROR_MESSAGES[code] ?? ERROR_MESSAGES.invalidImage)
    }

    setProcessing(false)
  }

  const handleRemove = () => {
    onChange(null)
  }

  return (
    <div className="tournament-image-field">
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_FILE_ACCEPT}
        onChange={handleFileChange}
        hidden
        disabled={disabled || processing}
      />

      {value ? (
        <div className="preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Imagen del torneo" className="preview-image" />
          <div className="preview-actions">
            <Tooltip title="Cambiar imagen">
              <span>
                <IconButton size="small" onClick={handlePick} disabled={disabled || processing}>
                  {processing ? <CircularProgress size={18} /> : <EditOutlinedIcon fontSize="small" />}
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Quitar imagen">
              <span>
                <IconButton size="small" onClick={handleRemove} disabled={disabled || processing}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </div>
        </div>
      ) : (
        <div className="placeholder" onClick={handlePick} role="button" tabIndex={0}>
          {processing ? (
            <CircularProgress size={22} />
          ) : (
            <>
              <AddPhotoAlternateOutlinedIcon />
              <Typography variant="body2">Subir imagen del torneo</Typography>
            </>
          )}
        </div>
      )}
    </div>
  )
}
