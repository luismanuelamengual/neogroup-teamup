import './index.scss'
import EmailIcon from '@mui/icons-material/Email'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlined'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Image from 'next/image'

interface OrgNotFoundProps {
  orgDomain: string
}

export default function OrgNotFound({ orgDomain }: OrgNotFoundProps) {
  return (
    <div className="org-not-found">
      <Image src="/logo.png" alt="TeamUp" width={200} height={32} priority className="org-not-found-logo" />
      <ErrorOutlineIcon className="org-not-found-icon" />
      <Typography variant="h5" component="h1" className="org-not-found-title">
        Organización no encontrada
      </Typography>
      <Typography variant="body1" className="org-not-found-message">
        <strong>{orgDomain}</strong> no está registrada en el sistema.
      </Typography>
      <Typography variant="body2" className="org-not-found-hint">
        Si creés que esto es un error, o querés registrar tu organización, contactate con <strong>Luis Amengual</strong>
        :
      </Typography>
      <Button
        variant="outlined"
        size="medium"
        startIcon={<EmailIcon />}
        href="mailto:luismanuelamengual@gmail.com"
        className="org-not-found-button"
      >
        luismanuelamengual@gmail.com
      </Button>
    </div>
  )
}
