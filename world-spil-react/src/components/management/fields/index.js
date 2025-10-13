import { defineHealthFields, HEALTH_FAMILY } from './health.fields';

export const MANAGEMENT_FIELDS_REGISTRY = {
  [HEALTH_FAMILY]: defineHealthFields,
  // later: add other families when migrated
};