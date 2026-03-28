package services

import (
	"encoding/json"
	"math"
	"strings"
	"time"

	"github.com/huaodong/llm-teaching-platform/backend/internal/models"
	apperrors "github.com/huaodong/llm-teaching-platform/backend/pkg/errors"
)

type OnboardingProfileInput struct {
	MajorTrack       string   `json:"major_track"`
	CurrentTasks     []string `json:"current_tasks"`
	PrimaryPlatform  string   `json:"primary_platform"`
	LocalComputeTier string   `json:"local_compute_tier"`
	NetworkTier      string   `json:"network_tier"`
	WritingStage     string   `json:"writing_stage"`
	PainPoints       []string `json:"pain_points"`
	PriorTools       []string `json:"prior_tools"`
	RoutePreference  string   `json:"route_preference,omitempty"`
	AnalyticsOptIn   bool     `json:"analytics_opt_in,omitempty"`
}

type LearningStyleInput struct {
	PreferredTime          string `json:"preferred_time"`
	Pace                   string `json:"pace,omitempty"`
	GuidanceStyle          string `json:"guidance_style"`
	FeedbackVerbosity      string `json:"feedback_verbosity"`
	LatencyTolerance       int    `json:"latency_tolerance"`
	GuidedRefusalTolerance int    `json:"guided_refusal_tolerance"`
	EvidenceFirstTolerance int    `json:"evidence_first_tolerance"`
}

var (
	allowedMajorTracks = map[string]struct{}{
		"ic_design":        {},
		"microelectronics": {},
		"electronic_info":  {},
		"cross_discipline": {},
	}
	allowedCurrentTasks = map[string]struct{}{
		"course_paper":          {},
		"lab_report":            {},
		"english_abstract_mail": {},
		"literature_review":     {},
		"proposal_midterm":      {},
		"thesis_chapter":        {},
		"unclear":               {},
	}
	allowedPrimaryPlatforms = map[string]struct{}{
		"windows":             {},
		"macos_apple_silicon": {},
		"macos_intel":         {},
		"linux":               {},
		"mobile_tablet":       {},
	}
	allowedLocalComputeTiers = map[string]struct{}{
		"cpu_only":            {},
		"nvidia_gpu":          {},
		"apple_silicon_local": {},
		"unknown":             {},
		"no_local":            {},
	}
	allowedNetworkTiers = map[string]struct{}{
		"stable_network":     {},
		"occasional_hotspot": {},
		"weak_network":       {},
		"offline_expected":   {},
	}
	allowedWritingStages = map[string]struct{}{
		"beginner_zero":        {},
		"first_paper":          {},
		"published_experience": {},
		"thesis_in_progress":   {},
	}
	allowedPainPoints = map[string]struct{}{
		"literature_search":       {},
		"citation_management":     {},
		"structure_logic":         {},
		"academic_tone_rewriting": {},
		"results_discussion":      {},
		"english_expression":      {},
		"research_question":       {},
		"other":                   {},
	}
	allowedPriorTools = map[string]struct{}{
		"chatgpt":        {},
		"kimi":           {},
		"deepseek":       {},
		"wenxin":         {},
		"qwen":           {},
		"gemini":         {},
		"copilot":        {},
		"academic_tools": {},
		"other":          {},
		"none":           {},
	}
	allowedPreferredTimes = map[string]struct{}{
		"morning":    {},
		"afternoon":  {},
		"evening":    {},
		"late_night": {},
		"flexible":   {},
	}
	allowedGuidanceStyles = map[string]struct{}{
		"strict_scaffold":      {},
		"options_guidance":     {},
		"rewrite_then_explain": {},
	}
	allowedFeedbackVerbosity = map[string]struct{}{
		"concise":  {},
		"balanced": {},
		"detailed": {},
	}
	baseCompetencyScores = map[string]float64{
		"beginner_zero":        0.25,
		"first_paper":          0.40,
		"published_experience": 0.60,
		"thesis_in_progress":   0.70,
	}
	painPointDimensionMap = map[string][]string{
		"literature_search":       {"critical_thinking"},
		"citation_management":     {"citation"},
		"structure_logic":         {"structure", "logic"},
		"academic_tone_rewriting": {"academic_writing", "grammar"},
		"results_discussion":      {"logic", "critical_thinking"},
		"english_expression":      {"grammar", "academic_writing"},
		"research_question":       {"critical_thinking", "logic"},
	}
)

// BuildInitialGlobalProfile turns activation questionnaire answers into the
// persisted global profile payload used by cold-start personalization.
func BuildInitialGlobalProfile(studentID uint, onboarding OnboardingProfileInput, learningStyle LearningStyleInput, analyticsOptIn bool) (*models.StudentGlobalProfile, error) {
	normalizedOnboarding, normalizedLearningStyle, err := normalizeOnboardingInputs(onboarding, learningStyle, analyticsOptIn)
	if err != nil {
		return nil, err
	}

	onboardingJSON, err := json.Marshal(normalizedOnboarding)
	if err != nil {
		return nil, apperrors.Internal(err)
	}

	learningStyleJSON, err := json.Marshal(normalizedLearningStyle)
	if err != nil {
		return nil, apperrors.Internal(err)
	}

	competenciesJSON, err := json.Marshal(deriveGlobalCompetencies(normalizedOnboarding.WritingStage, normalizedOnboarding.PainPoints))
	if err != nil {
		return nil, apperrors.Internal(err)
	}

	now := time.Now()
	return &models.StudentGlobalProfile{
		StudentID:          studentID,
		OnboardingProfile:  string(onboardingJSON),
		GlobalCompetencies: string(competenciesJSON),
		TotalStudyHours:    0,
		LearningStyle:      string(learningStyleJSON),
		UpdatedAt:          &now,
	}, nil
}

func ValidateActivationQuestionnaire(consentPersonalization bool, onboarding OnboardingProfileInput, learningStyle LearningStyleInput) error {
	_, _, err := normalizeOnboardingInputs(onboarding, learningStyle, false)
	if err != nil {
		return err
	}
	if !consentPersonalization {
		return apperrors.BadRequest("consent to account activation and personalized initialization is required")
	}
	return nil
}

func normalizeOnboardingInputs(onboarding OnboardingProfileInput, learningStyle LearningStyleInput, analyticsOptIn bool) (OnboardingProfileInput, LearningStyleInput, error) {
	normalizedOnboarding := OnboardingProfileInput{
		MajorTrack:       normalizeChoice(onboarding.MajorTrack),
		CurrentTasks:     normalizeChoices(onboarding.CurrentTasks),
		PrimaryPlatform:  normalizeChoice(onboarding.PrimaryPlatform),
		LocalComputeTier: normalizeChoice(onboarding.LocalComputeTier),
		NetworkTier:      normalizeChoice(onboarding.NetworkTier),
		WritingStage:     normalizeChoice(onboarding.WritingStage),
		PainPoints:       normalizeChoices(onboarding.PainPoints),
		PriorTools:       normalizeChoices(onboarding.PriorTools),
		AnalyticsOptIn:   analyticsOptIn,
	}
	normalizedLearningStyle := LearningStyleInput{
		PreferredTime:          normalizeChoice(learningStyle.PreferredTime),
		GuidanceStyle:          normalizeChoice(learningStyle.GuidanceStyle),
		FeedbackVerbosity:      normalizeChoice(learningStyle.FeedbackVerbosity),
		LatencyTolerance:       learningStyle.LatencyTolerance,
		GuidedRefusalTolerance: learningStyle.GuidedRefusalTolerance,
		EvidenceFirstTolerance: learningStyle.EvidenceFirstTolerance,
	}

	if err := validateChoice("major_track", normalizedOnboarding.MajorTrack, allowedMajorTracks); err != nil {
		return OnboardingProfileInput{}, LearningStyleInput{}, err
	}
	if err := validateChoiceList("current_tasks", normalizedOnboarding.CurrentTasks, allowedCurrentTasks, 1, 2); err != nil {
		return OnboardingProfileInput{}, LearningStyleInput{}, err
	}
	if err := validateChoice("primary_platform", normalizedOnboarding.PrimaryPlatform, allowedPrimaryPlatforms); err != nil {
		return OnboardingProfileInput{}, LearningStyleInput{}, err
	}
	if err := validateChoice("local_compute_tier", normalizedOnboarding.LocalComputeTier, allowedLocalComputeTiers); err != nil {
		return OnboardingProfileInput{}, LearningStyleInput{}, err
	}
	if err := validateChoice("network_tier", normalizedOnboarding.NetworkTier, allowedNetworkTiers); err != nil {
		return OnboardingProfileInput{}, LearningStyleInput{}, err
	}
	if err := validateChoice("writing_stage", normalizedOnboarding.WritingStage, allowedWritingStages); err != nil {
		return OnboardingProfileInput{}, LearningStyleInput{}, err
	}
	if err := validateChoiceList("pain_points", normalizedOnboarding.PainPoints, allowedPainPoints, 1, 3); err != nil {
		return OnboardingProfileInput{}, LearningStyleInput{}, err
	}
	if err := validateChoiceList("prior_tools", normalizedOnboarding.PriorTools, allowedPriorTools, 1, 9); err != nil {
		return OnboardingProfileInput{}, LearningStyleInput{}, err
	}
	if containsChoice(normalizedOnboarding.PriorTools, "none") && len(normalizedOnboarding.PriorTools) > 1 {
		return OnboardingProfileInput{}, LearningStyleInput{}, apperrors.BadRequest("prior_tools cannot combine none with other tools")
	}
	if err := validateChoice("preferred_time", normalizedLearningStyle.PreferredTime, allowedPreferredTimes); err != nil {
		return OnboardingProfileInput{}, LearningStyleInput{}, err
	}
	if err := validateChoice("guidance_style", normalizedLearningStyle.GuidanceStyle, allowedGuidanceStyles); err != nil {
		return OnboardingProfileInput{}, LearningStyleInput{}, err
	}
	if err := validateChoice("feedback_verbosity", normalizedLearningStyle.FeedbackVerbosity, allowedFeedbackVerbosity); err != nil {
		return OnboardingProfileInput{}, LearningStyleInput{}, err
	}
	if err := validateTolerance("latency_tolerance", normalizedLearningStyle.LatencyTolerance); err != nil {
		return OnboardingProfileInput{}, LearningStyleInput{}, err
	}
	if err := validateTolerance("guided_refusal_tolerance", normalizedLearningStyle.GuidedRefusalTolerance); err != nil {
		return OnboardingProfileInput{}, LearningStyleInput{}, err
	}
	if err := validateTolerance("evidence_first_tolerance", normalizedLearningStyle.EvidenceFirstTolerance); err != nil {
		return OnboardingProfileInput{}, LearningStyleInput{}, err
	}

	normalizedLearningStyle.Pace = derivePace(normalizedLearningStyle.GuidanceStyle)
	normalizedOnboarding.RoutePreference = deriveRoutePreference(normalizedOnboarding)

	return normalizedOnboarding, normalizedLearningStyle, nil
}

func deriveGlobalCompetencies(writingStage string, painPoints []string) map[string]float64 {
	base := baseCompetencyScores[writingStage]
	scores := map[string]float64{
		"academic_writing":  base,
		"citation":          base,
		"structure":         base,
		"logic":             base,
		"grammar":           base,
		"critical_thinking": base,
	}

	for _, painPoint := range painPoints {
		for _, dimension := range painPointDimensionMap[painPoint] {
			scores[dimension] = clampCompetency(scores[dimension] - 0.15)
		}
	}

	for dimension, value := range scores {
		scores[dimension] = math.Round(value*100) / 100
	}

	return scores
}

func derivePace(guidanceStyle string) string {
	switch guidanceStyle {
	case "strict_scaffold":
		return "slow"
	case "rewrite_then_explain":
		return "fast"
	default:
		return "moderate"
	}
}

func deriveRoutePreference(onboarding OnboardingProfileInput) string {
	localCapable := onboarding.LocalComputeTier == "nvidia_gpu" || onboarding.LocalComputeTier == "apple_silicon_local"
	poorNetwork := onboarding.NetworkTier == "weak_network" || onboarding.NetworkTier == "offline_expected"
	if localCapable && poorNetwork {
		return "local_first"
	}
	if onboarding.PrimaryPlatform == "mobile_tablet" || onboarding.LocalComputeTier == "cpu_only" || onboarding.LocalComputeTier == "no_local" {
		return "cloud_first"
	}
	return "auto"
}

func validateChoice(field, value string, allowed map[string]struct{}) error {
	if value == "" {
		return apperrors.BadRequest(field + " is required")
	}
	if _, ok := allowed[value]; !ok {
		return apperrors.BadRequest("invalid " + field)
	}
	return nil
}

func validateChoiceList(field string, values []string, allowed map[string]struct{}, minCount, maxCount int) error {
	if len(values) < minCount {
		return apperrors.BadRequest(field + " requires at least one selection")
	}
	if len(values) > maxCount {
		return apperrors.BadRequest(field + " exceeds selection limit")
	}
	for _, value := range values {
		if _, ok := allowed[value]; !ok {
			return apperrors.BadRequest("invalid " + field)
		}
	}
	return nil
}

func validateTolerance(field string, value int) error {
	if value < 1 || value > 5 {
		return apperrors.BadRequest(field + " must be between 1 and 5")
	}
	return nil
}

func normalizeChoice(value string) string {
	return strings.TrimSpace(strings.ToLower(value))
}

func normalizeChoices(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	normalized := make([]string, 0, len(values))
	for _, value := range values {
		normalizedValue := normalizeChoice(value)
		if normalizedValue == "" {
			continue
		}
		if _, ok := seen[normalizedValue]; ok {
			continue
		}
		seen[normalizedValue] = struct{}{}
		normalized = append(normalized, normalizedValue)
	}
	return normalized
}

func containsChoice(values []string, expected string) bool {
	for _, value := range values {
		if value == expected {
			return true
		}
	}
	return false
}

func clampCompetency(value float64) float64 {
	return math.Max(0.15, math.Min(0.85, value))
}
