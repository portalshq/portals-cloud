'use client'

import { ArrowUpRight, Bell, Check, ChevronLeft, ChevronRight, Circle, Grid2X2, Play, Search, Share2, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import styles from './ChannelsExperience.module.css'

type Channel = {
  slug: string
  title: string
  by: string
  description: string
  category: 'Live worlds' | 'Play' | 'Stories' | 'Learning'
  live?: boolean
  viewers: string
  runtime: string
  tint: 'violet' | 'red' | 'lime' | 'blue' | 'orange'
  kicker: string
}

const channels: Channel[] = [
  { slug: 'massively-social', title: 'The 25th Chapter', by: 'Massively Social', description: 'A continuous AI mystery. Enter at any moment; the story keeps moving.', category: 'Live worlds', live: true, viewers: '2.4k here now', runtime: '@portalshq/capability-realtime-fanout', tint: 'red', kicker: 'LIVE / EP. 25' },
  { slug: 'signal-syndicate', title: 'Signal Syndicate', by: 'Future Arcade', description: 'A cooperative relay race through an impossible broadcast station.', category: 'Play', viewers: '614 playing', runtime: '@portals/runtime-core', tint: 'violet', kicker: 'SEASON 03' },
  { slug: 'field-notes', title: 'Field Notes: The Pacific', by: 'Arc & Field', description: 'A living documentary shaped by voices from the waterline.', category: 'Stories', viewers: 'New episode Friday', runtime: '@portalshq/capability-video-delivery', tint: 'blue', kicker: 'DOCUMENTARY' },
  { slug: 'night-shift', title: 'Night Shift FM', by: 'B-Side Radio', description: 'Choose the next track, call the booth, leave a note for dawn.', category: 'Live worlds', live: true, viewers: '887 listening', runtime: '@portalshq/capability-queue-broadcast', tint: 'orange', kicker: 'ON AIR' },
  { slug: 'little-planet', title: 'Little Planet Lab', by: 'Common Room', description: 'A weekly world-building room for curious young architects.', category: 'Learning', viewers: 'Starts in 42 min', runtime: '@portals/sdk', tint: 'lime', kicker: 'WORKSHOP' },
  { slug: 'unfolding', title: 'Unfolding', by: 'Studio Chisel', description: 'A playable essay about memory, maps, and the cities we invent.', category: 'Stories', viewers: '1.1k exploring', runtime: '@portals/runtime-core', tint: 'violet', kicker: 'OPEN WORLD' },
]

const filters = ['All', 'Live now', 'Play', 'Stories', 'Learning'] as const

function ChannelMark({ channel }: { channel: Channel }) {
  return <div className={`${styles.mark} ${styles[channel.tint]}`} aria-hidden="true"><span /><i /><b /></div>
}

function ExperienceFrame({ channel, entered, onEnter }: { channel: Channel; entered: boolean; onEnter: () => void }) {
  return (
    <section className={`${styles.experience} ${styles[channel.tint]}`} aria-label={`${channel.title} experience`}>
      <div className={styles.scanlines} />
      <div className={styles.experienceTop}><span>{channel.kicker}</span><span className={styles.record}><i /> {channel.live ? 'TRANSMITTING' : 'PORTAL READY'}</span></div>
      <div className={styles.orbit}><span /><span /><span /></div>
      <div className={styles.experienceCopy}>
        <p>{channel.title.split(': ').map((line) => <span key={line}>{line}<br /></span>)}</p>
        <small>{channel.live ? <>THE SIGNAL IS MOVING<br />LIVE WITH EVERYONE HERE</> : <>THE NEXT WORLD IS<br />READY TO ENTER</>}</small>
      </div>
      <div className={styles.experienceFooter}>
        <span>01:18:43:22</span>
        <button className={styles.enterButton} onClick={onEnter}>{entered ? <><Check size={16} /> inside the portal</> : <><Play size={15} fill="currentColor" /> enter experience</>}</button>
        <span>INTERACTIVE BROADCAST</span>
      </div>
    </section>
  )
}

function BrowseCard({ channel, onOpen }: { channel: Channel; onOpen: (channel: Channel) => void }) {
  return <article className={styles.card}>
    <button className={`${styles.cardVisual} ${styles[channel.tint]}`} onClick={() => onOpen(channel)} aria-label={`Open ${channel.title}`}>
      <ChannelMark channel={channel} />
      <span className={styles.cardKicker}>{channel.kicker}</span>
      {channel.live && <span className={styles.livePill}><i /> live</span>}
      <span className={styles.cardArrow}><ArrowUpRight size={18} /></span>
      <div className={styles.cardArtwork}><span /><span /><span /></div>
    </button>
    <div className={styles.cardDetails}>
      <div><p className={styles.byline}>{channel.by}</p><h3>{channel.title}</h3></div>
      <p>{channel.description}</p>
      <div className={styles.cardMeta}><span>{channel.viewers}</span><span>{channel.category}</span></div>
    </div>
  </article>
}

export function ChannelsExperience({ initialSlug }: { initialSlug?: string }) {
  const [selected, setSelected] = useState<Channel | null>(() => channels.find((channel) => channel.slug === initialSlug) ?? null)
  const [filter, setFilter] = useState<(typeof filters)[number]>('All')
  const [query, setQuery] = useState('')
  const [entered, setEntered] = useState(false)
  const [saved, setSaved] = useState(false)
  const [shared, setShared] = useState(false)

  const visibleChannels = useMemo(() => channels.filter((channel) => {
    const matchesFilter = filter === 'All' || (filter === 'Live now' ? channel.live : channel.category === filter)
    const haystack = `${channel.title} ${channel.by} ${channel.category}`.toLowerCase()
    return matchesFilter && haystack.includes(query.toLowerCase())
  }), [filter, query])

  const openChannel = (channel: Channel) => { setSelected(channel); setEntered(false); setSaved(false); setShared(false); window.history.pushState({}, '', `/${channel.slug}`) }
  const closeChannel = () => { setSelected(null); window.history.pushState({}, '', '/') }

  if (selected) {
    return <main className={styles.shell}>
      <header className={styles.header}>
        <button className={styles.wordmark} onClick={closeChannel} aria-label="Back to channels">portals<span>/</span>channels</button>
        <nav><button onClick={closeChannel}>browse</button><span>for creators</span><span>about</span></nav>
        <button className={styles.profile}><span>VC</span><ChevronRight size={14} /></button>
      </header>
      <div className={styles.channelLayout}>
        <aside className={styles.rail}>
          <button onClick={closeChannel} className={styles.back}><ChevronLeft size={17} /> all channels</button>
          <div className={styles.railBrand}><ChannelMark channel={selected} /><p>{selected.by}</p></div>
          <div className={styles.railLinks}><span className={styles.activeLink}>experience</span><span>about</span><span>schedule</span><span>community</span></div>
          <div className={styles.runtime}><Sparkles size={14} /><p>powered by<br /><b>{selected.runtime}</b></p></div>
        </aside>
        <div className={styles.channelMain}>
          <div className={styles.channelIntro}>
            <div><p className={styles.eyebrow}>{selected.category} · independently produced</p><h1>{selected.title}</h1><p className={styles.introText}>{selected.description}</p></div>
            <div className={styles.introActions}>
              <button onClick={() => setSaved(!saved)}>{saved ? <Check size={16} /> : <Bell size={16} />}{saved ? 'following' : 'follow channel'}</button>
              <button onClick={() => { navigator.clipboard?.writeText(window.location.href); setShared(true) }}><Share2 size={16} />{shared ? 'link copied' : 'share'}</button>
            </div>
          </div>
          <ExperienceFrame channel={selected} entered={entered} onEnter={() => setEntered(!entered)} />
          <section className={styles.afterExperience}>
            <div><p className={styles.eyebrow}>right now</p><h2>Every session is a<br /><em>way in.</em></h2></div>
            <div className={styles.sessionNote}><span className={styles.pulse} /><div><b>Live room is open</b><p>Join the broadcast, add your signal, and leave when you want. Your place is saved.</p></div><button onClick={() => setEntered(true)}>open room <ArrowUpRight size={15} /></button></div>
          </section>
        </div>
      </div>
    </main>
  }

  return <main className={styles.shell}>
    <header className={styles.header}>
        <a className={styles.wordmark} href="/">portals<span>/</span>channels</a>
      <nav><button className={styles.navActive}>browse</button><span>for creators</span><span>about</span></nav>
      <button className={styles.profile}><span>VC</span><ChevronRight size={14} /></button>
    </header>
    <section className={styles.browseHero}>
      <div><p className={styles.eyebrow}>a network of living things</p><h1>Find your next<br /><em>way in.</em></h1></div>
      <div className={styles.heroAside}><p>Channels are places to gather, play, watch, and make a mark. Each one is its own application, alive on the Portals runtime.</p><div><span><Circle size={8} fill="currentColor" /> 12 live now</span><span>06:42 est</span></div></div>
    </section>
    <section className={styles.featured}>
      <div className={styles.featuredLabel}><span className={styles.livePill}><i /> live now</span><p>editor’s entry point</p></div>
      <button className={`${styles.featuredVisual} ${styles.red}`} onClick={() => openChannel(channels[0])}>
        <div className={styles.featuredArt}><div /><div /><div /><span>25</span></div>
        <div className={styles.featuredTitle}><p>Massively Social presents</p><h2>The 25th<br />Chapter</h2><span>enter the continuous mystery <ArrowUpRight size={17} /></span></div>
      </button>
      <div className={styles.featuredSummary}><p>An AI-generated world broadcast live, around the clock. Watch the story evolve with everyone else who’s here.</p><div><span>2.4k people here now</span><span>live world</span></div></div>
    </section>
    <section className={styles.feed}>
      <div className={styles.feedHead}><div><p className={styles.eyebrow}>browse channels</p><h2>What’s happening</h2></div><label className={styles.search}><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search channels" aria-label="Search channels" /></label></div>
      <div className={styles.filterRow}><div>{filters.map((item) => <button key={item} onClick={() => setFilter(item)} className={filter === item ? styles.filterActive : ''}>{item}</button>)}</div><Grid2X2 size={18} /></div>
      <div className={styles.cardGrid}>{visibleChannels.map((channel) => <BrowseCard key={channel.slug} channel={channel} onOpen={openChannel} />)}</div>
      {visibleChannels.length === 0 && <div className={styles.empty}><p>No channels found.</p><button onClick={() => { setFilter('All'); setQuery('') }}>clear search</button></div>}
    </section>
    <footer className={styles.localFooter}><span>portals / channels</span><p>Independent experiences, powered by creative infrastructure.</p><span>© 2026</span></footer>
  </main>
}
