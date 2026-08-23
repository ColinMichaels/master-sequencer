#pragma once

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

enum {
  PS_VST3_PROBE_MAX_CLASSES = 256,
  PS_VST3_PROBE_TEXT_32 = 33,
  PS_VST3_PROBE_TEXT_64 = 65,
  PS_VST3_PROBE_TEXT_128 = 129,
};

typedef struct {
  char class_id[PS_VST3_PROBE_TEXT_32];
  char category[PS_VST3_PROBE_TEXT_32];
  char name[PS_VST3_PROBE_TEXT_64];
  char vendor[PS_VST3_PROBE_TEXT_64];
  char version[PS_VST3_PROBE_TEXT_64];
  char sdk_version[PS_VST3_PROBE_TEXT_64];
  char sub_categories[PS_VST3_PROBE_TEXT_128];
} ps_vst3_probe_class;

typedef struct {
  int32_t status;
  int32_t total_classes;
  int32_t record_count;
  int32_t class_info_failures;
  int32_t records_truncated;
  char factory_vendor[PS_VST3_PROBE_TEXT_64];
  ps_vst3_probe_class classes[PS_VST3_PROBE_MAX_CLASSES];
} ps_vst3_probe_result;

int32_t ps_vst3_probe_bundle(const char* bundle_path, ps_vst3_probe_result* result);

#ifdef __cplusplus
}
#endif
