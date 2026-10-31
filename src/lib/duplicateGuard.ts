export function isDuplicateExtensionCopy(
  existingExtensionId: string | undefined,
  currentExtensionId: string,
): boolean {
  return existingExtensionId !== undefined && existingExtensionId !== currentExtensionId;
}
