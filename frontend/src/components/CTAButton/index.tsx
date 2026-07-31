import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from 'react'

type SharedProps = {
  children: ReactNode
  className?: string
  appearance?: 'default' | 'plain'
}

type LinkProps = SharedProps & {
  href: string
} & Omit<
    AnchorHTMLAttributes<HTMLAnchorElement>,
    'children' | 'className' | 'href'
  >

type ButtonProps = SharedProps & {
  href?: never
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'>

type CTAButtonProps = LinkProps | ButtonProps

const defaultClasses =
  't-button min-w-220 w-fit inline-flex justify-center items-center rounded h-48 gap-x-9 px-12 border border-white/10 bg-white/8 text-white backdrop-blur-[12px] hover:backdrop-blur-[50px] transition-colors duration-500 hover:!bg-white/30'

export function CTAButton(props: CTAButtonProps) {
  const {
    appearance = 'default',
    children,
    className = '',
    ...elementProps
  } = props
  const classes = `${appearance === 'plain' ? '' : defaultClasses} ${className}`.trim()
  const content = (
    <span className="t-p-sans inline-flex items-center gap-x-9">
      {children}
    </span>
  )

  if ('href' in elementProps && typeof elementProps.href === 'string') {
    return (
      <a {...elementProps} className={classes}>
        {content}
      </a>
    )
  }

  return (
    <button {...elementProps} className={classes}>
      {content}
    </button>
  )
}
