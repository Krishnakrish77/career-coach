export const ONBOARDING_VERSION = 1;

export function buildOnboardingSteps({ preferences = {}, resume = null, recommendations = [], jobs = [] } = {}) {
  const hasTitles = [...(preferences.target_titles || []), ...(preferences.title_aliases || [])].length > 0;
  return [
    { id: 'preferences', label: 'Set your job preferences', detail: 'Add at least one target title so recommendations are relevant.', complete: hasTitles, tab: 'settings', target: 'targetTitles' },
    { id: 'resume', label: 'Save your resume', detail: 'Your resume powers fit and ATS keyword signals.', complete: Boolean(resume?.id), tab: 'resume', target: 'resumeText' },
    { id: 'discovery', label: 'Find jobs', detail: 'Search trusted public sources using your saved preferences.', complete: recommendations.length > 0, tab: 'discovery', target: 'findJobs' },
    { id: 'tracker', label: 'Save or track a role', detail: 'Move a promising role into your application tracker.', complete: jobs.length > 0, tab: 'jobs', target: 'jobList' },
  ];
}

export function nextIncompleteOnboardingStep(steps = []) {
  return steps.find((step) => !step.complete) || null;
}
