'use client'
import { REPORT_REASONS, type ReportReason } from '@iwb/shared'
import { type FormEvent, useState } from 'react'
import { send } from '@/lib/send'
import { announce } from './Announcer'
import { PRIMARY, SECONDARY } from './buttons'
import { Chips } from './Chips'
import { Dialog } from './Dialog'
import { ErrorText } from './ErrorText'

const REASON_CHOICES = (Object.keys(REPORT_REASONS) as ReportReason[]).map((key) => [key, REPORT_REASONS[key]] as const)
const MISSING = 'Choose why you are reporting it.'

/**
 * The report form (§3, §4.3): one of the four reasons, then Report. Its request id is made once, so sending it again,
 * by a retry or by hand, can't report twice (§5.3). `onReported` gets whether the photo is now hidden.
 */
export function ReportDialog({
  photoId,
  onCancel,
  onReported,
}: {
  photoId: string
  onCancel: () => void
  onReported: (hidden: boolean) => void
}) {
  const [requestId] = useState(() => crypto.randomUUID())
  const [reason, setReason] = useState<ReportReason>()
  const [checked, setChecked] = useState(false)
  const [failure, setFailure] = useState<string>()
  const [sending, setSending] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (sending) return
    if (!reason) {
      setChecked(true)
      announce(MISSING)
      event.currentTarget.querySelector<HTMLInputElement>('[name="reason"]')?.focus()
      return
    }
    setSending(true)
    setFailure(undefined)
    const sent = await send<{ hidden: boolean }>(`/api/photos/${photoId}/report`, { requestId, reason })
    setSending(false)
    if (sent.ok) return onReported(sent.data.hidden)
    setFailure(sent.error.message)
    announce(sent.error.message)
  }

  return (
    <Dialog title="Report this photo" onCancel={onCancel}>
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <Chips
          legend="Why are you reporting it?"
          name="reason"
          choices={REASON_CHOICES}
          value={reason}
          error={checked && !reason ? MISSING : undefined}
          onChange={setReason}
        />
        {failure && <ErrorText>{failure}</ErrorText>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`${SECONDARY} grow`} onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className={`${PRIMARY} grow`}>
            {sending ? 'Reporting…' : 'Report'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
