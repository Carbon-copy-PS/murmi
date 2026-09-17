import TranscriptPanel from './TranscriptPanel'
import { transcriptText } from '../utils/traditional-transcript-text'

// Loaded only for the Traditional Chinese selection, keeping the dictionaries
// out of the initial application bundle and other-language sessions.
export default function TraditionalTranscriptPanel(props) {
  return <TranscriptPanel {...props} formatText={transcriptText} />
}
