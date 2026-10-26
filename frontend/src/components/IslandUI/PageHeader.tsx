import { Link, useNavigate } from "@tanstack/react-router"
import { Modal, Tooltip } from "animal-island-ui"
import { type ComponentProps, type ReactNode, useState } from "react"
import { IslandButton } from "./IslandButton"
import { ArrowLeftIcon, EllipsisIcon } from "./island-icons"
import styles from "./page-header.module.css"

type HeaderActionProps = ComponentProps<typeof IslandButton> & {
  icon: ReactNode
  label: string
  mobileIconOnly?: boolean
}

/** Real Animal Island buttons; pages supply their existing handlers and state. */
export function HeaderAction({
  icon,
  label,
  mobileIconOnly = false,
  className = "",
  ...props
}: HeaderActionProps) {
  return (
    <IslandButton
      {...props}
      aria-label={props["aria-label"] ?? label}
      className={`${styles.action} ${mobileIconOnly ? styles.iconOnMobile : ""} ${className}`}
    >
      {icon}
      <span>{label}</span>
    </IslandButton>
  )
}

export type HeaderMenuItem = {
  id: string
  label: string
  icon: ReactNode
  onSelect: () => void
  disabled?: boolean
}

export function HeaderMenu({
  items,
  disabled = false,
}: {
  items: HeaderMenuItem[]
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Tooltip title="更多操作">
        <IslandButton
          className={styles.menuTrigger}
          aria-label="更多操作"
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <EllipsisIcon size={20} />
        </IslandButton>
      </Tooltip>
      <Modal
        open={open}
        title="更多操作"
        onClose={() => setOpen(false)}
        footer={null}
        width={340}
        typewriter={false}
      >
        <div className={styles.menuList}>
          {items.map((item) => (
            <IslandButton
              key={item.id}
              block
              disabled={item.disabled}
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
            >
              {item.icon}
              {item.label}
            </IslandButton>
          ))}
        </div>
      </Modal>
    </>
  )
}

export function PageHeader({
  title,
  shortTitle = title,
  icon,
  home = false,
  actions,
}: {
  title: string
  shortTitle?: string
  icon: ReactNode
  home?: boolean
  actions?: ReactNode
}) {
  const navigate = useNavigate()
  const label = (
    <>
      <span className={styles.fullTitle}>{title}</span>
      <span className={styles.shortTitle}>{shortTitle}</span>
    </>
  )
  return (
    <header
      className={styles.header}
      data-testid="page-header"
      data-home={home}
    >
      <div className={styles.inner}>
        <div className={styles.identity}>
          {!home && (
            <>
              <IslandButton
                variant="text"
                className={styles.back}
                aria-label="返回群岛"
                onClick={() => void navigate({ to: "/island-preview" })}
              >
                <ArrowLeftIcon size={17} />
                <span>返回</span>
              </IslandButton>
              <span className={styles.divider} aria-hidden="true" />
            </>
          )}
          <span className={styles.mark} aria-hidden="true">
            {icon}
          </span>
          {home ? (
            <Link className={styles.homeBrand} to="/" aria-label="返回心屿入口">
              <strong>{title}</strong>
              <span>Mind Island</span>
            </Link>
          ) : (
            <h1 className={styles.title} aria-label={title} title={title}>
              {label}
            </h1>
          )}
        </div>
        {actions && (
          <nav
            className={styles.actions}
            aria-label={home ? "群岛导航" : `${title}操作`}
          >
            {actions}
          </nav>
        )}
      </div>
    </header>
  )
}
