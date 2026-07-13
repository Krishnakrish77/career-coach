export function weekStart(date = new Date()) {
  const value = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7));
  return value.toISOString().slice(0, 10);
}

export function buildCoachingPlan({ jobs = [], goals = {}, stories = [] } = {}) {
  const applications = jobs.map((job) => job.applications?.[0] || { status: 'saved' });
  const count = (status) => applications.filter((app) => app.status === status).length;
  const saved = count('saved'); const applied = count('applied'); const interviewing = count('interviewing');
  // Only titles with real applied/interviewing signal are worth surfacing —
  // sorted by that signal, not by whichever titles happened to appear first
  // in a recency-ordered job list, so a title with real activity is never
  // silently dropped in favor of a just-saved role with none.
  const byTitle = Object.values(jobs.reduce((groups, job) => { const title = job.title || 'Untitled role'; const app = job.applications?.[0] || { status: 'saved' }; const bucket = groups[title] || { title, applied: 0, interviewing: 0 }; if (app.status === 'applied') bucket.applied += 1; if (app.status === 'interviewing') bucket.interviewing += 1; groups[title] = bucket; return groups; }, {}))
    .filter((bucket) => bucket.applied + bucket.interviewing > 0)
    .sort((a, b) => (b.applied + b.interviewing) - (a.applied + a.interviewing))
    .slice(0, 5);
  const bySource = Object.entries(jobs.reduce((groups, job) => { const key = job.source || 'manual'; groups[key] = (groups[key] || 0) + 1; return groups; }, {}));
  const overdue = applications.filter((app) => app.next_follow_up_at && new Date(app.next_follow_up_at) <= new Date()).length;
  const items = []; const insights = [];
  if (!goals.capacity_hours) items.push({ item_type: 'setup', description: 'Set your weekly capacity so the plan can stay realistic.', target_count: 1 });
  if (saved && saved >= Math.max(5, applied * 2)) items.push({ item_type: 'triage', description: `Review ${Math.min(saved, 10)} saved roles and intentionally apply, skip, or archive them.`, target_count: Math.min(saved, 10) });
  if (overdue) items.push({ item_type: 'follow_up', description: `Complete ${overdue} overdue follow-up${overdue === 1 ? '' : 's'} before adding new applications.`, target_count: overdue });
  if (interviewing) items.push({ item_type: 'prep', description: `Prepare for ${Math.min(interviewing, goals.weekly_prep_target || 1)} active interview${interviewing === 1 ? '' : 's'} using your story bank.`, target_count: Math.min(interviewing, goals.weekly_prep_target || 1) });
  if (applied >= 20 && !interviewing) insights.push({ insight_type: 'conversion', message: 'You have a meaningful number of applications without an interview yet. Consider reviewing resume positioning and target roles.', confidence: 'medium', evidence: { applied, interviewing } });
  if (!stories.length && interviewing) items.push({ item_type: 'story_bank', description: 'Create or confirm 3 STAR stories before your next interview.', target_count: 3 });
  if (!items.length) items.push({ item_type: 'apply', description: `Choose up to ${goals.weekly_application_target ?? 3} strong-fit roles after reviewing fit and quality.`, target_count: goals.weekly_application_target ?? 3 });
  return { summary: 'A focused, adjustable plan based on your tracked activity.', items: items.slice(0, 5), insights, analytics: { saved, applied, interviewing, offers: count('offer'), rejected: count('rejected'), overdue_follow_ups: overdue, interview_rate: applied ? Math.round((interviewing / applied) * 100) : null, by_title: byTitle, by_source: bySource } };
}
