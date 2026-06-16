import './index.scss'

export default function Loading() {
  return (
    <div className="loading">
      <div className="wrapper">
        <svg className="svg" viewBox="0 -15 100 135" xmlns="http://www.w3.org/2000/svg">
          <ellipse className="shadowPulse" cx="50" cy="115" rx="15" ry="3" />
          <g className="racketGroup">
            <ellipse className="racketHead" cx="50" cy="45" rx="22" ry="28" />
            <path className="racketBridge" d="M 35 65 Q 50 85 50 85 Q 50 85 65 65" />
            <line className="racketHandle" x1="50" y1="85" x2="50" y2="110" />
          </g>
          <g className="ballGroup">
            <circle className="ballBody" cx="50" cy="45" r="12" />
            <path className="ballLine" d="M 42 35.5 A 9 9 0 0 0 42 54.5" />
            <path className="ballLine" d="M 58 35.5 A 9 9 0 0 1 58 54.5" />
          </g>
        </svg>
      </div>
    </div>
  )
}
