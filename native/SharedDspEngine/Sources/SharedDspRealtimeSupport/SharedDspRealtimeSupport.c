#include "SharedDspRealtimeSupport.h"

#include <mach/mach_time.h>
#include <stdatomic.h>
#include <stdlib.h>
#include <string.h>

struct PSRealtimeMetrics {
    _Atomic uint64_t callbacks;
    _Atomic uint64_t renderedFrames;
    _Atomic uint64_t frameMismatches;
    _Atomic uint64_t deadlineMisses;
    _Atomic uint64_t timingGapXruns;
    _Atomic uint64_t renderErrors;
    _Atomic uint64_t processorOverloads;
    _Atomic uint64_t deviceChanges;
    _Atomic uint64_t shadowCallbacks;
    _Atomic uint64_t shadowFrames;
    _Atomic uint64_t shadowFailures;
    _Atomic uint64_t shadowParameterWord;
    _Atomic uint64_t shadowParameterPublishes;
    _Atomic uint64_t longestCallbackTicks;
    _Atomic uint64_t previousOutputHostTime;
    _Atomic uint64_t deadlineTicks;
    _Atomic uint64_t ticksPerFrame;
    _Atomic uint32_t expectedFrames;
    void *shadowContext;
};

extern int32_t ps_shared_dsp_shadow_process(void *context, uint32_t frameCount, uint64_t parameterWord);

static uint64_t ps_seconds_to_host_ticks(double seconds) {
    mach_timebase_info_data_t info;
    if (mach_timebase_info(&info) != KERN_SUCCESS || info.numer == 0) return 0;
    long double nanoseconds = (long double)seconds * 1000000000.0L;
    return (uint64_t)(nanoseconds * (long double)info.denom / (long double)info.numer);
}

static double ps_host_ticks_to_milliseconds(uint64_t ticks) {
    mach_timebase_info_data_t info;
    if (mach_timebase_info(&info) != KERN_SUCCESS || info.denom == 0) return 0;
    long double nanoseconds = (long double)ticks * (long double)info.numer / (long double)info.denom;
    return (double)(nanoseconds / 1000000.0L);
}

static void ps_atomic_max(_Atomic uint64_t *target, uint64_t candidate) {
    uint64_t current = atomic_load_explicit(target, memory_order_relaxed);
    while (candidate > current && !atomic_compare_exchange_weak_explicit(
        target,
        &current,
        candidate,
        memory_order_relaxed,
        memory_order_relaxed
    )) {}
}

PSRealtimeMetrics *ps_realtime_metrics_create(void) {
    return calloc(1, sizeof(PSRealtimeMetrics));
}

void ps_realtime_metrics_destroy(PSRealtimeMetrics *metrics) {
    free(metrics);
}

void ps_realtime_metrics_configure(PSRealtimeMetrics *metrics, uint32_t expectedFrames, double sampleRate) {
    if (!metrics) return;
    atomic_store_explicit(&metrics->expectedFrames, expectedFrames, memory_order_relaxed);
    uint64_t deadline = sampleRate > 0 ? ps_seconds_to_host_ticks((double)expectedFrames / sampleRate) : 0;
    uint64_t ticksPerFrame = sampleRate > 0 ? ps_seconds_to_host_ticks(1.0 / sampleRate) : 0;
    atomic_store_explicit(&metrics->deadlineTicks, deadline, memory_order_relaxed);
    atomic_store_explicit(&metrics->ticksPerFrame, ticksPerFrame, memory_order_relaxed);
    atomic_store_explicit(&metrics->previousOutputHostTime, 0, memory_order_relaxed);
}

void ps_realtime_metrics_configure_shadow(PSRealtimeMetrics *metrics, void *shadowContext) {
    if (!metrics) return;
    metrics->shadowContext = shadowContext;
}

void ps_realtime_publish_shadow_output_gain(PSRealtimeMetrics *metrics, uint32_t generation, float outputGainDb) {
    if (!metrics || generation == 0) return;
    uint32_t gainBits = 0;
    memcpy(&gainBits, &outputGainDb, sizeof(gainBits));
    uint64_t word = ((uint64_t)generation << 32) | gainBits;
    atomic_store_explicit(&metrics->shadowParameterWord, word, memory_order_release);
    atomic_fetch_add_explicit(&metrics->shadowParameterPublishes, 1, memory_order_relaxed);
}

void ps_realtime_metrics_reset_timing(PSRealtimeMetrics *metrics) {
    if (!metrics) return;
    atomic_store_explicit(&metrics->previousOutputHostTime, 0, memory_order_relaxed);
}

void ps_realtime_metrics_record_device_change(PSRealtimeMetrics *metrics) {
    if (!metrics) return;
    atomic_fetch_add_explicit(&metrics->deviceChanges, 1, memory_order_relaxed);
}

#define PS_GETTER(name, field) \
uint64_t name(const PSRealtimeMetrics *metrics) { \
    return metrics ? atomic_load_explicit(&metrics->field, memory_order_relaxed) : 0; \
}

PS_GETTER(ps_realtime_callbacks, callbacks)
PS_GETTER(ps_realtime_rendered_frames, renderedFrames)
PS_GETTER(ps_realtime_frame_mismatches, frameMismatches)
PS_GETTER(ps_realtime_deadline_misses, deadlineMisses)
PS_GETTER(ps_realtime_timing_gap_xruns, timingGapXruns)
PS_GETTER(ps_realtime_render_errors, renderErrors)
PS_GETTER(ps_realtime_processor_overloads, processorOverloads)
PS_GETTER(ps_realtime_device_changes, deviceChanges)
PS_GETTER(ps_realtime_shadow_callbacks, shadowCallbacks)
PS_GETTER(ps_realtime_shadow_frames, shadowFrames)
PS_GETTER(ps_realtime_shadow_failures, shadowFailures)
PS_GETTER(ps_realtime_shadow_parameter_word, shadowParameterWord)
PS_GETTER(ps_realtime_shadow_parameter_publishes, shadowParameterPublishes)

double ps_realtime_longest_callback_ms(const PSRealtimeMetrics *metrics) {
    return metrics ? ps_host_ticks_to_milliseconds(atomic_load_explicit(&metrics->longestCallbackTicks, memory_order_relaxed)) : 0;
}

int ps_realtime_metrics_are_lock_free(const PSRealtimeMetrics *metrics) {
    if (!metrics) return 0;
    return atomic_is_lock_free(&metrics->callbacks)
        && atomic_is_lock_free(&metrics->renderedFrames)
        && atomic_is_lock_free(&metrics->shadowCallbacks)
        && atomic_is_lock_free(&metrics->longestCallbackTicks)
        && atomic_is_lock_free(&metrics->expectedFrames);
}

int ps_realtime_shadow_parameter_word_is_lock_free(const PSRealtimeMetrics *metrics) {
    return metrics && atomic_is_lock_free(&metrics->shadowParameterWord);
}

OSStatus ps_silence_render_callback(
    void *inRefCon,
    AudioUnitRenderActionFlags *ioActionFlags,
    const AudioTimeStamp *inTimeStamp,
    UInt32 inBusNumber,
    UInt32 inNumberFrames,
    AudioBufferList *ioData
) {
    (void)inBusNumber;
    PSRealtimeMetrics *metrics = (PSRealtimeMetrics *)inRefCon;
    if (!metrics || !ioData) return noErr;
    uint64_t startedAt = mach_absolute_time();

    if (metrics->shadowContext) {
        uint64_t parameterWord = atomic_load_explicit(&metrics->shadowParameterWord, memory_order_acquire);
        int32_t shadowStatus = ps_shared_dsp_shadow_process(metrics->shadowContext, inNumberFrames, parameterWord);
        if (shadowStatus == 0) {
            atomic_fetch_add_explicit(&metrics->shadowCallbacks, 1, memory_order_relaxed);
            atomic_fetch_add_explicit(&metrics->shadowFrames, inNumberFrames, memory_order_relaxed);
        } else {
            atomic_fetch_add_explicit(&metrics->shadowFailures, 1, memory_order_relaxed);
        }
    }

    // Shadow processing never receives ioData. Hardware buffers are zeroed only
    // after it completes, preserving an explicit muted-output boundary.
    for (UInt32 index = 0; index < ioData->mNumberBuffers; index += 1) {
        AudioBuffer *buffer = &ioData->mBuffers[index];
        if (buffer->mData && buffer->mDataByteSize > 0) memset(buffer->mData, 0, buffer->mDataByteSize);
    }

    atomic_fetch_add_explicit(&metrics->callbacks, 1, memory_order_relaxed);
    atomic_fetch_add_explicit(&metrics->renderedFrames, inNumberFrames, memory_order_relaxed);
    uint32_t expectedFrames = atomic_load_explicit(&metrics->expectedFrames, memory_order_relaxed);
    if (inNumberFrames == 0 || (expectedFrames > 0 && inNumberFrames > expectedFrames)) atomic_fetch_add_explicit(&metrics->frameMismatches, 1, memory_order_relaxed);
    if (ioActionFlags && (*ioActionFlags & kAudioUnitRenderAction_PostRenderError) != 0) atomic_fetch_add_explicit(&metrics->renderErrors, 1, memory_order_relaxed);

    uint64_t ticksPerFrame = atomic_load_explicit(&metrics->ticksPerFrame, memory_order_relaxed);
    uint64_t deadlineTicks = ticksPerFrame > 0 ? ticksPerFrame * inNumberFrames : atomic_load_explicit(&metrics->deadlineTicks, memory_order_relaxed);
    if (inTimeStamp && (inTimeStamp->mFlags & kAudioTimeStampHostTimeValid) != 0 && deadlineTicks > 0) {
        uint64_t previous = atomic_exchange_explicit(&metrics->previousOutputHostTime, inTimeStamp->mHostTime, memory_order_relaxed);
        if (previous > 0 && inTimeStamp->mHostTime > previous + deadlineTicks + (deadlineTicks / 2)) {
            atomic_fetch_add_explicit(&metrics->timingGapXruns, 1, memory_order_relaxed);
        }
    }

    uint64_t durationTicks = mach_absolute_time() - startedAt;
    ps_atomic_max(&metrics->longestCallbackTicks, durationTicks);
    if (deadlineTicks > 0 && durationTicks > deadlineTicks) atomic_fetch_add_explicit(&metrics->deadlineMisses, 1, memory_order_relaxed);
    return noErr;
}

OSStatus ps_install_silence_render_callback(AudioUnit unit, PSRealtimeMetrics *metrics) {
    AURenderCallbackStruct callback = {
        .inputProc = ps_silence_render_callback,
        .inputProcRefCon = metrics,
    };
    return AudioUnitSetProperty(
        unit,
        kAudioUnitProperty_SetRenderCallback,
        kAudioUnitScope_Input,
        0,
        &callback,
        sizeof(callback)
    );
}

static OSStatus ps_default_output_listener(
    AudioObjectID inObjectID,
    UInt32 inNumberAddresses,
    const AudioObjectPropertyAddress inAddresses[],
    void *inClientData
) {
    (void)inObjectID;
    (void)inNumberAddresses;
    (void)inAddresses;
    ps_realtime_metrics_record_device_change((PSRealtimeMetrics *)inClientData);
    return noErr;
}

static OSStatus ps_processor_overload_listener(
    AudioObjectID inObjectID,
    UInt32 inNumberAddresses,
    const AudioObjectPropertyAddress inAddresses[],
    void *inClientData
) {
    (void)inObjectID;
    (void)inNumberAddresses;
    (void)inAddresses;
    PSRealtimeMetrics *metrics = (PSRealtimeMetrics *)inClientData;
    if (metrics) atomic_fetch_add_explicit(&metrics->processorOverloads, 1, memory_order_relaxed);
    return noErr;
}

OSStatus ps_install_default_output_listener(PSRealtimeMetrics *metrics) {
    AudioObjectPropertyAddress address = {
        .mSelector = kAudioHardwarePropertyDefaultOutputDevice,
        .mScope = kAudioObjectPropertyScopeGlobal,
        .mElement = kAudioObjectPropertyElementMain,
    };
    return AudioObjectAddPropertyListener(
        kAudioObjectSystemObject,
        &address,
        ps_default_output_listener,
        metrics
    );
}

OSStatus ps_remove_default_output_listener(PSRealtimeMetrics *metrics) {
    AudioObjectPropertyAddress address = {
        .mSelector = kAudioHardwarePropertyDefaultOutputDevice,
        .mScope = kAudioObjectPropertyScopeGlobal,
        .mElement = kAudioObjectPropertyElementMain,
    };
    return AudioObjectRemovePropertyListener(
        kAudioObjectSystemObject,
        &address,
        ps_default_output_listener,
        metrics
    );
}

OSStatus ps_install_processor_overload_listener(AudioObjectID deviceID, PSRealtimeMetrics *metrics) {
    AudioObjectPropertyAddress address = {
        .mSelector = kAudioDeviceProcessorOverload,
        .mScope = kAudioObjectPropertyScopeGlobal,
        .mElement = kAudioObjectPropertyElementMain,
    };
    return AudioObjectAddPropertyListener(deviceID, &address, ps_processor_overload_listener, metrics);
}

OSStatus ps_remove_processor_overload_listener(AudioObjectID deviceID, PSRealtimeMetrics *metrics) {
    AudioObjectPropertyAddress address = {
        .mSelector = kAudioDeviceProcessorOverload,
        .mScope = kAudioObjectPropertyScopeGlobal,
        .mElement = kAudioObjectPropertyElementMain,
    };
    return AudioObjectRemovePropertyListener(deviceID, &address, ps_processor_overload_listener, metrics);
}
