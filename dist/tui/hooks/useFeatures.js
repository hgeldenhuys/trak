/**
 * useFeatures Hook - Reactive feature data fetching for TUI
 *
 * Provides reactive access to features with automatic updates
 * when feature or story data changes (for story counts).
 */
import { useMultiTableQuery } from './useMultiTableQuery';
import { featureRepository } from '../../repositories';
/**
 * Hook to get all features
 * Also subscribes to story changes since features often display story counts.
 *
 * @returns Reactive query result with features array
 *
 * @example
 * ```typescript
 * const { data: features, isLoading, lastUpdated } = useFeatures();
 * for (const feature of features) {
 *   console.log(`${feature.code}: ${feature.name} (${feature.storyCounter} stories)`);
 * }
 * ```
 */
export function useFeatures() {
    return useMultiTableQuery(() => featureRepository.findAll(), ['feature', 'story'] // Update when stories change (for counts)
    );
}
/**
 * Hook to get a single feature by ID
 *
 * @param featureId - The feature ID to fetch
 * @returns Reactive query result with feature or null
 *
 * @example
 * ```typescript
 * const { data: feature, isLoading } = useFeature('feature-123');
 * if (feature) {
 *   console.log(`${feature.code}: ${feature.name}`);
 * }
 * ```
 */
export function useFeature(featureId) {
    return useMultiTableQuery(() => featureRepository.findById(featureId), ['feature']);
}
/**
 * Hook to get a feature by its code
 *
 * @param code - The feature code (e.g., 'NOTIFY', 'AUTH')
 * @returns Reactive query result with feature or null
 *
 * @example
 * ```typescript
 * const { data: feature } = useFeatureByCode('NOTIFY');
 * ```
 */
export function useFeatureByCode(code) {
    return useMultiTableQuery(() => featureRepository.findByCode(code), ['feature']);
}
