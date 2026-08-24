import {ImageResponse} from 'next/og'

export const alt = 'portals AI creative production workflow assessment'
export const size = {width: 1200, height: 630}
export const contentType = 'image/png'
export const dynamic = 'force-static'

export async function GET() {
  return new ImageResponse(
    <div style={{width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '64px 72px', color: 'white', background: 'linear-gradient(135deg, #010528 0%, #183c86 52%, #79c7da 100%)', fontFamily: 'Arial, sans-serif'}}>
      <div style={{display: 'flex', fontSize: 34}}>portals</div>
      <div style={{display: 'flex', flexDirection: 'column', gap: 24}}>
        <div style={{fontSize: 66, lineHeight: 1.03, maxWidth: 1020}}>AI creative production workflow assessment</div>
        <div style={{fontSize: 28, opacity: 0.88}}>Approved versions · generation history · reproducibility · production memory</div>
      </div>
    </div>,
    size,
  )
}
