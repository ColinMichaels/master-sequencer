#pragma once

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

enum {
  PS_VST3_LAB_MAX_PARAMETERS = 256,
  PS_VST3_LAB_TEXT_64 = 65,
  PS_VST3_LAB_TEXT_128 = 129,
  PS_VST3_LAB_DIGEST = 65,
};

typedef struct {
  uint32_t parameter_id;
  int32_t step_count;
  int32_t flags;
  double default_normalized;
  double current_normalized;
  char title[PS_VST3_LAB_TEXT_128];
  char short_title[PS_VST3_LAB_TEXT_128];
  char units[PS_VST3_LAB_TEXT_64];
} ps_vst3_lab_parameter;

typedef struct {
  int32_t status;
  int32_t parameter_count;
  int32_t parameter_record_count;
  int32_t parameters_truncated;
  int32_t writable_parameter_round_trip;
  int32_t input_bus_count;
  int32_t output_bus_count;
  int32_t input_channels;
  int32_t output_channels;
  uint32_t latency_samples;
  uint32_t tail_samples;
  int32_t processed_blocks;
  int32_t output_is_finite;
  double zero_input_peak;
  int32_t component_state_bytes;
  int32_t controller_state_bytes;
  int32_t component_state_round_trip;
  int32_t controller_state_round_trip;
  char component_state_sha256[PS_VST3_LAB_DIGEST];
  char controller_state_sha256[PS_VST3_LAB_DIGEST];
  ps_vst3_lab_parameter parameters[PS_VST3_LAB_MAX_PARAMETERS];
} ps_vst3_lab_result;

int32_t ps_vst3_run_instance_lab(
    const char* bundle_path,
    const char* processor_class_id,
    ps_vst3_lab_result* result);

#ifdef __cplusplus
}
#endif
