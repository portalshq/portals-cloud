'use client'

import { ArrowUpRight, Check, Search, Sparkles, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createRoomSound, type RoomAccount } from '@/lib/room-controls'
import { Rail } from '@/components/shell/Rail'
import { FollowButton, ShareButton } from './actions'
import { ChannelAppRoom } from './ChannelAppRoom'
import { ChannelHeadingFonts } from './ChannelHeadingFonts'
import { ChannelMeta } from './ChannelMeta'
import { ChannelPreview, useChannelPreview } from './ChannelPreview'
import { ChannelStream } from './ChannelStream'
import {
  browseCopy,
  filterIcons,
  filters,
  type Channel,
  type Filter,
} from './data'
import { useOnScreen } from './use-on-screen'
import styles from './ChannelsExperience.module.css'

const initial = (title: string) => title.charAt(0)
const tabletBrowse = '(max-width: 1200px)'

function Actions({ channel }: { channel: Channel }) {
  return (
    <div className={styles.actions}>
      <FollowButton channel={channel.slug} />
      <ShareButton channel={channel.slug} url={`/${channel.slug}`} />
    </div>
  )
}

function Card({
  channel: initialChannel,
  active,
  onVisibility,
  onPreference,
}: {
  channel: Channel
  active: boolean
  onVisibility: (slug: string, visible: boolean) => void
  onPreference: (slug: string, preferred: boolean) => void
}) {
  const [ref, { visible }] = useOnScreen<HTMLLIElement>()
  const channel = useChannelPreview(initialChannel, active && visible)
  const { slug, preview } = initialChannel

  useEffect(() => {
    if (!preview || !visible) return
    onVisibility(slug, true)
    return () => onVisibility(slug, false)
  }, [onVisibility, preview, slug, visible])

  return (
    <li ref={ref}>
      <Link
        className={styles.card}
        href={`/${slug}`}
        onPointerEnter={preview ? () => onPreference(slug, true) : undefined}
        onPointerLeave={preview ? () => onPreference(slug, false) : undefined}
        onFocus={preview ? () => onPreference(slug, true) : undefined}
        onBlur={preview ? () => onPreference(slug, false) : undefined}
      >
        <span className={styles.cardMedia}>
          <ChannelPreview channel={channel} active={active && visible} />
          <span className={styles.pill}>{channel.live ? 'live' : channel.category}</span>
        </span>
        <span className={styles.cardBody}>
          <span className={styles.cardTitle} style={channel.heading}>{channel.title}</span>
          <span className={styles.cardMeta}>
            {channel.by}
            <span aria-hidden="true">·</span>
            {channel.live ? channel.viewers : channel.source}
          </span>
        </span>
      </Link>
    </li>
  )
}

function SearchTool({
  query,
  onQuery,
  expanded,
  onOpen,
  onClose,
}: {
  query: string
  onQuery: (value: string) => void
  expanded: boolean
  onOpen: () => void
  onClose: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const active = query.length > 0

  useEffect(() => {
    if (expanded) input.current?.focus({ preventScroll: window.matchMedia(tabletBrowse).matches })
  }, [expanded])

  return (
    <div className={`${styles.tool} ${styles.searchCell}`}>
      <div
        className={styles.searchOpen}
        data-expanded={expanded}
        onBlur={(event) => {
          if (!query && !event.currentTarget.contains(event.relatedTarget)) onClose()
        }}
      >
        <button
          className={`${styles.toolIcon} ${styles.searchIcon}`}
          type="button"
          aria-expanded={expanded}
          onMouseDown={(event) => {
            // Keep the input from blurring before the toggle handles the click.
            if (expanded) event.preventDefault()
          }}
          onClick={(event) => {
            if (!expanded) {
              onOpen()
              return
            }
            event.currentTarget.focus()
            onQuery('')
            onClose()
          }}
          aria-label={
            !expanded ? 'Search channels' : active ? 'Clear the search' : 'Close the search'
          }
        >
          {active ? (
            <X size={17} strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <Search size={19} strokeWidth={1.75} aria-hidden="true" />
          )}
        </button>
        <input
          ref={input}
          type="search"
          value={query}
          placeholder="type to search"
          aria-label="Search channels"
          aria-hidden={!expanded}
          tabIndex={expanded ? 0 : -1}
          onChange={(event) => onQuery(event.target.value)}
        />
      </div>
      <span className={styles.toolLabel}>Search</span>
    </div>
  )
}

function Tools({
  filter,
  onFilter,
  query,
  onQuery,
  onSearchOpen,
}: {
  filter: Filter | null
  onFilter: (next: Filter | null) => void
  query: string
  onQuery: (value: string) => void
  onSearchOpen: () => void
}) {
  const [open, setOpen] = useState(false)
  const expanded = open || query.length > 0

  return (
    <div className={styles.tools} data-search-open={expanded}>
      <div className={styles.toolRow}>
        {filters.map((item) => {
          const Icon = filterIcons[item]
          const active = filter === item
          return (
            <button
              key={item}
              className={styles.tool}
              type="button"
              aria-pressed={active}
              onClick={() => onFilter(active ? null : item)}
            >
              <span className={styles.toolIcon}>
                {active ? (
                  <X size={19} strokeWidth={1.75} aria-hidden="true" />
                ) : (
                  <Icon size={19} strokeWidth={1.75} aria-hidden="true" />
                )}
              </span>
              <span className={styles.toolLabel}>{item}</span>
            </button>
          )
        })}
        <span className={styles.searchSlot} aria-hidden="true" />
      </div>
      <SearchTool
        query={query}
        onQuery={onQuery}
        expanded={expanded}
        onOpen={() => {
          onFilter(null)
          setOpen(true)
          onSearchOpen()
        }}
        onClose={() => setOpen(false)}
      />
    </div>
  )
}

function BrowseIndex({ channels }: { channels: Channel[] }) {
  const browseHead = useRef<HTMLDivElement>(null)
  const [filter, setFilter] = useState<Filter | null>(null)
  const [query, setQuery] = useState('')
  const [visiblePreviews, setVisiblePreviews] = useState<Set<string>>(() => new Set())
  const [preferredPreview, setPreferredPreview] = useState<string | null>(null)

  const scrollToBrowseHead = () => {
    if (!window.matchMedia(tabletBrowse).matches) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    browseHead.current?.scrollIntoView({
      behavior: reduceMotion ? 'instant' : 'smooth',
      block: 'nearest',
      inline: 'nearest',
    })
  }

  const updatePreviewVisibility = useCallback((slug: string, visible: boolean) => {
    setVisiblePreviews((current) => {
      if (current.has(slug) === visible) return current
      const next = new Set(current)
      if (visible) next.add(slug)
      else next.delete(slug)
      return next
    })
  }, [])

  const preferPreview = useCallback((slug: string, preferred: boolean) => {
    setPreferredPreview((current) => preferred ? slug : current === slug ? null : current)
  }, [])
  const featured = channels.find((channel) => channel.slug === 'massively-social') ?? channels[0]

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return channels.filter((channel) => {
      const matchesFilter =
        filter === null || (filter === 'Live now' ? channel.live : channel.category === filter)
      const haystack = `${channel.title} ${channel.by} ${channel.category}`.toLowerCase()
      return matchesFilter && haystack.includes(needle)
    })
  }, [channels, filter, query])

  const activePreview = visible.find(({ slug }) => slug === preferredPreview && visiblePreviews.has(slug))
    ?? visible.find(({ slug }) => visiblePreviews.has(slug))

  // Both counts describe the current scope, not the whole catalogue.
  const liveInScope = visible.filter((channel) => channel.live).length

  return (
    <>
      <Rail />
      <main className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.heroTop}>
            <h1 className={styles.heroHeading}>{browseCopy.heading}</h1>
            <dl className={styles.heroStats}>
              <div>
                <dt>live now</dt>
                <dd>{liveInScope}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className={styles.featured} aria-labelledby="featured-heading">
          <Link className={styles.featuredCard} href={`/${featured.slug}`}>
            <span className={styles.featuredMedia}>
              <span className={styles.pill}>live now</span>
            </span>
            <span className={styles.featuredBody}>
              <h2 className={styles.featuredTitle} style={featured.heading} id="featured-heading">
                {featured.title}
                <ArrowUpRight
                  className={styles.featuredArrow}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </h2>
              <span className={styles.featuredMeta}>
                {featured.by}
                <span aria-hidden="true">·</span>
                {featured.viewers}
              </span>
              <p className={styles.featuredLine}>{browseCopy.featuredLine}</p>
            </span>
          </Link>
        </section>

        <section className={styles.browse} aria-labelledby="browse-heading">
          <div ref={browseHead} className={styles.browseHead}>
              <h2 className={styles.sectionHeading} id="browse-heading">
                Find channels
              </h2>
            {/* {(
              <div className={styles.heroStats}>
                <div>
                  <dt>in view</dt>
                  <dd>{visible.length}</dd>
                </div>
              </div>
            )} */}
            <Tools
              filter={filter}
              onFilter={setFilter}
              query={query}
              onQuery={setQuery}
              onSearchOpen={scrollToBrowseHead}
            />
          </div>

          
          {visible.length > 0 ? (
            <ul className={styles.grid}>
              {visible.map((channel) => (
                <Card
                  key={channel.slug}
                  channel={channel}
                  active={activePreview?.slug === channel.slug}
                  onVisibility={updatePreviewVisibility}
                  onPreference={preferPreview}
                />
              ))}
            </ul>
          ) : (
            <div className={styles.empty}>
              <p>Nothing matches that yet.</p>
              <button
                className={styles.secondary}
                type="button"
                onClick={() => {
                  setFilter(null)
                  setQuery('')
                }}
              >
                Clear the filters
              </button>
            </div>
          )}
        </section>

        <footer className={styles.footer}>
          <span>© 2026</span>
        </footer>
      </main>
    </>
  )
}

/* The page is the channel. There is no gate to open, so the stage is a
   presence surface rather than an entry point. The stream starts when the
   stage first comes on screen and is never torn down afterwards: the copy
   promises nothing resets while you are away, and remounting would drop the
   stream back to the top. The monogram holds the frame until then, so the box
   is already the right size when the player arrives and the layout never
   shifts on mount. */
function Stage({ channel, muted }: { channel: Channel & { stream: string }; muted: boolean }) {
  const [ref, { visible, seen }] = useOnScreen<HTMLDivElement>()

  return (
    <div className={styles.stageMedia} ref={ref}>
      {!seen && (
        <span className={styles.stageMonogram} aria-hidden="true">
          {initial(channel.title)}
        </span>
      )}
      {seen && (
        <ChannelStream channel={channel} noteClassName={styles.stageNote} paused={!visible} muted={muted} />
      )}
    </div>
  )
}

function ChannelDetail({ channel }: { channel: Channel }) {
  const [sound] = useState(createRoomSound)
  const muted = useSyncExternalStore(sound.subscribe, sound.getMuted, () => true)
  const [account, setAccount] = useState<RoomAccount | null>(null)
  const [appSoundAvailable, setAppSoundAvailable] = useState(false)
  const hasSound = channel.app ? appSoundAvailable : Boolean(channel.stream)

  return (
    <>
      <Rail roomSlug={channel.slug} sound={{ muted, toggle: sound.toggle, disabled: !hasSound }} account={account} />
      {channel.app ? (
        <ChannelAppRoom app={channel.app} name={channel.preview?.name ?? channel.title}
          heading={channel.heading} sound={sound} onAccountChange={setAccount} onSoundAvailable={setAppSoundAvailable} />
      ) : (
        <main className={styles.detail} data-channel-room>
          <div className={styles.detailHead}>
            <h1 className={styles.detailTitle} style={channel.heading}>{channel.title}</h1>
            <ChannelMeta channel={channel} />
            {channel.description && <p className={styles.description}>{channel.description}</p>}
            <Actions channel={channel} />
          </div>

          {channel.stream && <Stage channel={{ ...channel, stream: channel.stream }} muted={muted} />}
        </main>
      )}
    </>
  )
}

export function ChannelsExperience({ channels, channel }: { channels: Channel[]; channel?: Channel }) {
  return (
    <>
      <ChannelHeadingFonts channels={channel ? [channel] : channels} />
      {channel ? <ChannelDetail key={channel.slug} channel={channel} /> : <BrowseIndex channels={channels} />}
    </>
  )
}
