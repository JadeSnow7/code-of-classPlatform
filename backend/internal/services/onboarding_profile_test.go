package services

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestBuildInitialGlobalProfile_DerivesExpectedPayloads(t *testing.T) {
	profile, err := BuildInitialGlobalProfile(42, OnboardingProfileInput{
		MajorTrack:       "ic_design",
		CurrentTasks:     []string{"course_paper", "thesis_chapter"},
		PrimaryPlatform:  "macos_apple_silicon",
		LocalComputeTier: "apple_silicon_local",
		NetworkTier:      "offline_expected",
		WritingStage:     "first_paper",
		PainPoints:       []string{"citation_management", "structure_logic", "english_expression"},
		PriorTools:       []string{"chatgpt", "kimi"},
	}, LearningStyleInput{
		PreferredTime:          "evening",
		GuidanceStyle:          "rewrite_then_explain",
		FeedbackVerbosity:      "detailed",
		LatencyTolerance:       5,
		GuidedRefusalTolerance: 3,
		EvidenceFirstTolerance: 4,
	}, true)

	assert.NoError(t, err)
	assert.Equal(t, uint(42), profile.StudentID)

	var onboarding map[string]any
	assert.NoError(t, json.Unmarshal([]byte(profile.OnboardingProfile), &onboarding))
	assert.Equal(t, "local_first", onboarding["route_preference"])
	assert.Equal(t, true, onboarding["analytics_opt_in"])

	var learningStyle map[string]any
	assert.NoError(t, json.Unmarshal([]byte(profile.LearningStyle), &learningStyle))
	assert.Equal(t, "fast", learningStyle["pace"])
	assert.Equal(t, "rewrite_then_explain", learningStyle["guidance_style"])

	var competencies map[string]float64
	assert.NoError(t, json.Unmarshal([]byte(profile.GlobalCompetencies), &competencies))
	assert.Equal(t, 0.25, competencies["citation"])
	assert.Equal(t, 0.25, competencies["structure"])
	assert.Equal(t, 0.25, competencies["logic"])
	assert.Equal(t, 0.25, competencies["academic_writing"])
	assert.Equal(t, 0.25, competencies["grammar"])
	assert.Equal(t, 0.4, competencies["critical_thinking"])
}

func TestValidateActivationQuestionnaire_RejectsInvalidSelection(t *testing.T) {
	err := ValidateActivationQuestionnaire(true, OnboardingProfileInput{
		MajorTrack:       "unknown",
		CurrentTasks:     []string{"course_paper"},
		PrimaryPlatform:  "windows",
		LocalComputeTier: "cpu_only",
		NetworkTier:      "stable_network",
		WritingStage:     "first_paper",
		PainPoints:       []string{"citation_management"},
		PriorTools:       []string{"none"},
	}, LearningStyleInput{
		PreferredTime:          "evening",
		GuidanceStyle:          "options_guidance",
		FeedbackVerbosity:      "balanced",
		LatencyTolerance:       3,
		GuidedRefusalTolerance: 3,
		EvidenceFirstTolerance: 3,
	})

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "invalid major_track")
}
