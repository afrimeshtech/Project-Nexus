'use client'

/**
 * A submit button that asks before it fires, for actions consequential
 * enough to deserve a pause but too simple to justify a full confirmation
 * form (see `RejectBusinessForm` in `components/admin/AdminForms.tsx` for
 * the pattern when a reason is also needed — that one already has its own
 * proper two-step confirm and is untouched by this component). The native
 * `confirm()` dialog is deliberate: this exists so a plain server-action
 * form gets *some* "are you sure," not a bespoke modal, for the smallest
 * correct fix.
 */
export function ConfirmSubmitButton({
  children,
  message,
  className,
}: {
  children: React.ReactNode
  message: string
  className?: string
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault()
      }}
    >
      {children}
    </button>
  )
}
