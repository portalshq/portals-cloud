import {ImageResponse} from 'next/og'

export const alt = 'PX by Portals — a harness for your AI creative work'
export const size = {width: 1200, height: 630}
export const contentType = 'image/png'
export const dynamic = 'force-static'

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '58px 66px', color: '#e8f0eb', background: 'radial-gradient(ellipse at 30% 20%, #5f8946 0%, transparent 26%), radial-gradient(ellipse at 82% 72%, #743d2c 0%, transparent 32%), #0b110d', fontFamily: 'Arial, sans-serif'}}>
      <div style={{display: 'flex', justifyContent: 'space-between', fontSize: 28, letterSpacing: 3}}><span>PX</span><span style={{opacity: .65}}>BY PORTALS</span></div>
      <div style={{display: 'flex', flexDirection: 'column'}}><div style={{fontSize: 180, fontWeight: 800, letterSpacing: -18, lineHeight: .72, textShadow: '4px 4px #263c2b'}}>px</div><div style={{display: 'flex', marginTop: 50, fontSize: 54, maxWidth: 900, lineHeight: 1}}>A harness for your AI creative work.</div></div>
      <div style={{display: 'flex', fontSize: 24, color: '#dffc72'}}>CREATE IT ONCE. KEEP CREATING WITH IT.</div>
    </div>,
    size,
  )
}
