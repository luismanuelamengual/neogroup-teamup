import './index.scss'
import EmailIcon from '@mui/icons-material/Email'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import GroupsIcon from '@mui/icons-material/Groups'
import LeaderboardIcon from '@mui/icons-material/Leaderboard'
import SportsTennisIcon from '@mui/icons-material/SportsTennis'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Image from 'next/image'

export default function LandingPage() {
  return (
    <div className="landing-page">
      <header className="landing-header">
        <Image src="/logo-white.png" alt="TeamUp" width={200} height={32} priority className="landing-logo" />
      </header>

      <main className="landing-main">
        <section className="landing-hero">
          <SportsTennisIcon className="hero-icon" />
          <Typography variant="h3" component="h1" className="hero-title">
            Organizá tus torneos y ligas de tenis y pádel
          </Typography>
          <Typography variant="h6" component="p" className="hero-subtitle">
            TeamUp es la plataforma para gestionar competencias deportivas: inscripciones, fixtures, resultados y
            posiciones, todo en un solo lugar.
          </Typography>
        </section>

        <section className="landing-features">
          <div className="feature-card">
            <EmojiEventsIcon className="feature-icon" />
            <Typography variant="h6" className="feature-title">
              Torneos
            </Typography>
            <Typography variant="body2" className="feature-description">
              Creá torneos de eliminación directa, americano o grupos con playoff. El sistema genera el fixture y
              registra los resultados automáticamente.
            </Typography>
          </div>
          <div className="feature-card">
            <LeaderboardIcon className="feature-icon" />
            <Typography variant="h6" className="feature-title">
              Ligas
            </Typography>
            <Typography variant="body2" className="feature-description">
              Organizá ligas con múltiples rondas y seguí la tabla de posiciones en tiempo real.
            </Typography>
          </div>
          <div className="feature-card">
            <GroupsIcon className="feature-icon" />
            <Typography variant="h6" className="feature-title">
              Tu organización
            </Typography>
            <Typography variant="body2" className="feature-description">
              Cada club o institución tiene su propio espacio privado con acceso desde su propio subdominio.
            </Typography>
          </div>
        </section>

        <section className="landing-cta">
          <Typography variant="h5" className="cta-title">
            ¿Querés empezar a usar TeamUp en tu club?
          </Typography>
          <Typography variant="body1" className="cta-description">
            Contactate con <strong>Luis Amengual</strong> para que te creemos una organización.
          </Typography>
          <Button
            variant="contained"
            size="large"
            startIcon={<EmailIcon />}
            href="mailto:luismanuelamengual@gmail.com"
            className="cta-button"
          >
            luismanuelamengual@gmail.com
          </Button>
        </section>
      </main>

      <footer className="landing-footer">
        <Typography variant="body2">© {new Date().getFullYear()} TeamUp · Todos los derechos reservados</Typography>
      </footer>
    </div>
  )
}
