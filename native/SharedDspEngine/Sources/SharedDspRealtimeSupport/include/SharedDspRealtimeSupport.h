#ifndef SHARED_DSP_REALTIME_SUPPORT_H
#define SHARED_DSP_REALTIME_SUPPORT_H

#include <AudioToolbox/AudioToolbox.h>
#include <CoreAudio/CoreAudio.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct PSRealtimeMetrics PSRealtimeMetrics;

PSRealtimeMetrics *ps_realtime_metrics_create(void);
void ps_realtime_metrics_destroy(PSRealtimeMetrics *metrics);
void ps_realtime_metrics_configure(PSRealtimeMetrics *metrics, uint32_t expectedFrames, double sampleRate);
void ps_realtime_metrics_configure_shadow(PSRealtimeMetrics *metrics, int enabled);
void ps_realtime_publish_shadow_output_gain(PSRealtimeMetrics *metrics, uint32_t generation, float outputGainDb);
void ps_realtime_metrics_reset_timing(PSRealtimeMetrics *metrics);
void ps_realtime_metrics_record_device_change(PSRealtimeMetrics *metrics);

uint64_t ps_realtime_callbacks(const PSRealtimeMetrics *metrics);
uint64_t ps_realtime_rendered_frames(const PSRealtimeMetrics *metrics);
uint64_t ps_realtime_frame_mismatches(const PSRealtimeMetrics *metrics);
uint64_t ps_realtime_deadline_misses(const PSRealtimeMetrics *metrics);
uint64_t ps_realtime_timing_gap_xruns(const PSRealtimeMetrics *metrics);
uint64_t ps_realtime_render_errors(const PSRealtimeMetrics *metrics);
uint64_t ps_realtime_processor_overloads(const PSRealtimeMetrics *metrics);
uint64_t ps_realtime_device_changes(const PSRealtimeMetrics *metrics);
uint64_t ps_realtime_sample_rate_changes(const PSRealtimeMetrics *metrics);
uint64_t ps_realtime_shadow_callbacks(const PSRealtimeMetrics *metrics);
uint64_t ps_realtime_shadow_frames(const PSRealtimeMetrics *metrics);
uint64_t ps_realtime_shadow_failures(const PSRealtimeMetrics *metrics);
uint64_t ps_realtime_shadow_parameter_word(const PSRealtimeMetrics *metrics);
uint64_t ps_realtime_shadow_parameter_publishes(const PSRealtimeMetrics *metrics);
uint64_t ps_realtime_shadow_kernel_processed_frames(const PSRealtimeMetrics *metrics);
uint32_t ps_realtime_shadow_captured_frames(const PSRealtimeMetrics *metrics);
uint64_t ps_realtime_shadow_recovered_samples(const PSRealtimeMetrics *metrics);
uint32_t ps_realtime_shadow_applied_updates(const PSRealtimeMetrics *metrics);
uint32_t ps_realtime_shadow_last_applied_generation(const PSRealtimeMetrics *metrics);
float ps_realtime_shadow_last_applied_output_gain_db(const PSRealtimeMetrics *metrics);
uint32_t ps_realtime_shadow_capture_sample_bits(const PSRealtimeMetrics *metrics, uint32_t channel, uint32_t frame);
double ps_realtime_longest_callback_ms(const PSRealtimeMetrics *metrics);
int ps_realtime_metrics_are_lock_free(const PSRealtimeMetrics *metrics);
int ps_realtime_shadow_parameter_word_is_lock_free(const PSRealtimeMetrics *metrics);

OSStatus ps_silence_render_callback(
    void *inRefCon,
    AudioUnitRenderActionFlags *ioActionFlags,
    const AudioTimeStamp *inTimeStamp,
    UInt32 inBusNumber,
    UInt32 inNumberFrames,
    AudioBufferList *ioData
);

OSStatus ps_install_silence_render_callback(AudioUnit unit, PSRealtimeMetrics *metrics);

OSStatus ps_install_default_output_listener(PSRealtimeMetrics *metrics);
OSStatus ps_remove_default_output_listener(PSRealtimeMetrics *metrics);
OSStatus ps_install_processor_overload_listener(AudioObjectID deviceID, PSRealtimeMetrics *metrics);
OSStatus ps_remove_processor_overload_listener(AudioObjectID deviceID, PSRealtimeMetrics *metrics);
OSStatus ps_install_sample_rate_listener(AudioObjectID deviceID, PSRealtimeMetrics *metrics);
OSStatus ps_remove_sample_rate_listener(AudioObjectID deviceID, PSRealtimeMetrics *metrics);

#ifdef __cplusplus
}
#endif

#endif
