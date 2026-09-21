export function statementPattern(result) {
  const total = result.responded || 0
  if (!total) return 'unanswered'
  if (result.support > total / 2) return 'support'
  if (result.oppose > total / 2) return 'oppose'
  if (result.neutral > Math.max(result.support || 0, result.oppose || 0)) return 'neutral'
  return 'mixed'
}
const labels = {
  en: { support: 'Majority support', oppose: 'Majority opposition', neutral: 'Neutral most common', mixed: 'No clear majority', unanswered: 'No responses', answered: 'answered', missing: 'unanswered', intro: 'Majority means more than half of those who answered. Percentages use each statement’s respondents. Neutral may reflect uncertainty or reservations; the vote alone does not tell us why. Unanswered votes are separate.' },
  zh: { support: '多數支持', oppose: '多數反對', neutral: '中立最多', mixed: '意見分歧', unanswered: '尚無回應', answered: '人作答', missing: '未作答', intro: '「多數」指該題回應者過半；比例以回應者計算。中立可能包含不確定或保留，無法單憑投票判定原因；未作答另列。' },
  de: { support: 'Mehrheit dafür', oppose: 'Mehrheit dagegen', neutral: 'Neutral am häufigsten', mixed: 'Keine klare Mehrheit', unanswered: 'Keine Antworten', answered: 'haben geantwortet', missing: 'unbeantwortet', intro: 'Mehrheit bedeutet mehr als die Hälfte der Antworten auf die Aussage. Prozentwerte beziehen sich auf die Antworten. Neutral kann Unsicherheit oder Vorbehalte bedeuten; der Grund ist aus der Stimme nicht erkennbar. Fehlende Antworten stehen separat.' },
  fr: { support: 'Majorité favorable', oppose: 'Majorité opposée', neutral: 'Neutralité la plus fréquente', mixed: 'Sans majorité claire', unanswered: 'Aucune réponse', answered: 'ont répondu', missing: 'sans réponse', intro: 'Une majorité correspond à plus de la moitié des réponses à la proposition. Les pourcentages portent sur ces réponses. La neutralité peut refléter une incertitude ou des réserves, sans que le vote en indique la raison. Les absences de réponse sont séparées.' },
  it: { support: 'Maggioranza favorevole', oppose: 'Maggioranza contraria', neutral: 'Neutralità più frequente', mixed: 'Nessuna maggioranza chiara', unanswered: 'Nessuna risposta', answered: 'hanno risposto', missing: 'senza risposta', intro: 'La maggioranza è più della metà delle risposte alla singola affermazione. Le percentuali si riferiscono a chi ha risposto. La neutralità può indicare incertezza o riserve, ma il voto non ne rivela il motivo. Le mancate risposte sono separate.' },
}
export function statementPatternCopy(language) { return labels[language.split('-')[0]] || labels.en }
export const statementPatternOrder = ['support', 'oppose', 'neutral', 'mixed', 'unanswered']
