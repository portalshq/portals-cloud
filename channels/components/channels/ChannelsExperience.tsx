'use client'

import { ArrowUpRight, Check, ChevronLeft, Search, Sparkles, X } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Rail } from '@/components/shell/Rail'
import { FollowButton, ShareButton } from './actions'
import { ChannelStream } from './ChannelStream'
import {
  browseCopy,
  channels,
  filterIcons,
  filters,
  type Channel,
  type Filter,
} from './data'
import { useOnScreen } from './use-on-screen'
import styles from './ChannelsExperience.module.css'

const initial = (title: string) => title.charAt(0)

function StatusLine({ channel }: { channel: Channel }) {
  return (
    <p className={styles.status}>
      <span className={styles.statusDot} aria-hidden="true" />
      <span>{channel.live ? 'Live now' : channel.viewers}</span>
      <span aria-hidden="true">·</span>
      <span>{channel.category}</span>
    </p>
  )
}

function Actions({ channel }: { channel: Channel }) {
  return (
    <div className={styles.actions}>
      <FollowButton />
      <ShareButton url={`/${channel.slug}`} />
    </div>
  )
}

function Card({ channel }: { channel: Channel }) {
  return (
    <li>
      <Link className={styles.card} href={`/${channel.slug}`}>
        <span className={styles.cardMedia}>
          <span className={styles.pill}>{channel.live ? 'live' : channel.category}</span>
          <span className={styles.monogram} aria-hidden="true">
            {initial(channel.title)}
          </span>
        </span>
        <span className={styles.cardBody}>
          <span className={styles.cardTitle}>{channel.title}</span>
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
  open,
  onOpen,
  onClose,
}: {
  query: string
  onQuery: (value: string) => void
  open: boolean
  onOpen: () => void
  onClose: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const active = query.length > 0

  useEffect(() => {
    if (open) input.current?.focus()
  }, [open])

  // Collapsed, the field is a single square icon button. It is a hard swap
  // rather than a width animation, which the motion rules do not allow.
  if (!open && !active) {
    return (
      <button
        className={styles.tool}
        type="button"
        onClick={onOpen}
        aria-label="Search channels"
      >
        <span className={styles.toolIcon}>
          <Search size={19} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <span className={styles.toolLabel}>Search</span>
      </button>
    )
  }

  return (
    <div className={styles.searchCell}>
      <div className={styles.searchOpen}>
        <button
          className={styles.searchIcon}
          type="button"
          /* X dismisses outright. Deferring the clear so the field could stay
             open leaves it stuck: mousedown blurs the input before the click
             lands, so the empty-value close check still sees the old value. */
          onClick={() => {
            onQuery('')
            onClose()
          }}
          aria-label={active ? 'Clear the search' : 'Close the search'}
        >
          {active ? (
            <X size={17} strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <Search size={17} strokeWidth={1.75} aria-hidden="true" />
          )}
        </button>
        <input
          ref={input}
          type="search"
          value={query}
          placeholder="a name or a maker"
          aria-label="Search channels"
          onChange={(event) => onQuery(event.target.value)}
          onBlur={() => {
            if (!query) onClose()
          }}
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
}: {
  filter: Filter | null
  onFilter: (next: Filter | null) => void
  query: string
  onQuery: (value: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className={styles.tools}>
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
      <SearchTool
        query={query}
        onQuery={onQuery}
        open={open}
        onOpen={() => setOpen(true)}
        onClose={() => setOpen(false)}
      />
    </div>
  )
}

function BrowseIndex() {
  const [filter, setFilter] = useState<Filter | null>(null)
  const [query, setQuery] = useState('')
  const featured = channels[0]

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return channels.filter((channel) => {
      const matchesFilter =
        filter === null || (filter === 'Live now' ? channel.live : channel.category === filter)
      const haystack = `${channel.title} ${channel.by} ${channel.category}`.toLowerCase()
      return matchesFilter && haystack.includes(needle)
    })
  }, [filter, query])

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
              <div>
                <dt>in view</dt>
                <dd>{visible.length}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className={styles.featured} aria-labelledby="featured-heading">
          <Link className={styles.featuredCard} href={`/${featured.slug}`}>
            <span className={styles.featuredMedia}>
              <span className={styles.pill}>live now</span>
              <span className={styles.featuredNumeral} aria-hidden="true">
                25
              </span>
            </span>
            <span className={styles.featuredBody}>
              <h2 className={styles.featuredTitle} id="featured-heading">
                {featured.title}
                <ArrowUpRight
                  className={styles.featuredArrow}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </h2>
              <p className={styles.featuredLine}>{browseCopy.featuredLine}</p>
              <span className={styles.featuredMeta}>
                {featured.by}
                <span aria-hidden="true">·</span>
                {featured.viewers}
              </span>
            </span>
          </Link>
        </section>

        <section className={styles.browse} aria-labelledby="browse-heading">
          <div className={styles.browseHead}>
            <h2 className={styles.sectionHeading} id="browse-heading">
              Every channel
            </h2>
            <Tools
              filter={filter}
              onFilter={setFilter}
              query={query}
              onQuery={setQuery}
            />
          </div>

          {visible.length > 0 ? (
            <ul className={styles.grid}>
              {visible.map((channel) => (
                <Card key={channel.slug} channel={channel} />
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
          <Link className={styles.footerLink} href="/">
            Back to the feed
          </Link>
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
function Stage({ channel }: { channel: Channel }) {
  const [ref, { visible, seen }] = useOnScreen<HTMLDivElement>()

  return (
    <div className={styles.stageMedia} ref={ref}>
      {!seen && (
        <span className={styles.stageMonogram} aria-hidden="true">
          {initial(channel.title)}
        </span>
      )}
      {seen && (
        <ChannelStream
          channel={channel}
          noteClassName={styles.stageNote}
          settledMessage={channel.live ? 'Broadcasting right now' : channel.viewers}
          paused={!visible}
        />
      )}
    </div>
  )
}

function ChannelDetail({ channel }: { channel: Channel }) {
  return (
    <>
      <Rail
        position={{ current: channels.indexOf(channel) + 1, total: channels.length }}
      >
        <Link className={styles.railBack} href="/channels">
          <ChevronLeft size={17} strokeWidth={1.75} aria-hidden="true" />
          <span data-rail-label>All channels</span>
        </Link>
      </Rail>

      <main className={styles.detail}>
        <div className={styles.detailHead}>
          <StatusLine channel={channel} />
          <h1 className={styles.detailTitle}>{channel.title}</h1>
          <p className={styles.detailByline}>
            {channel.by}
            <span className={styles.source}>
              <Sparkles size={13} strokeWidth={1.75} aria-hidden="true" />
              {channel.source}
            </span>
          </p>
          <p className={styles.description}>{channel.description}</p>
          <Actions channel={channel} />
        </div>

        <Stage channel={channel} />

        <section className={styles.session} aria-labelledby="session-heading">
          <h2 className={styles.sessionHeading} id="session-heading">
            Everyone is welcome mid-story
          </h2>
          <p className={styles.description}>
            {browseCopy.detailLede} Come and go as you like; nothing resets while
            you are away.
          </p>
        </section>
      </main>
    </>
  )
}

export function ChannelsExperience({ slug }: { slug?: string }) {
  const channel = slug ? channels.find((entry) => entry.slug === slug) : undefined
  return channel ? <ChannelDetail channel={channel} /> : <BrowseIndex />
}
