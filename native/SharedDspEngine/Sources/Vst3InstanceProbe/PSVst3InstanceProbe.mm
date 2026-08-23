#include "PSVst3InstanceProbe.h"
#include "PSVst3Abi.hpp"

#include <CommonCrypto/CommonDigest.h>
#include <CoreFoundation/CoreFoundation.h>
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <limits>
#include <vector>

namespace {

using namespace ps_vst3_abi;

constexpr std::size_t kMaximumStateBytes = 1'048'576;
constexpr int32 kLabInvalidArgument = 1;
constexpr int32 kLabInvalidClassID = 2;
constexpr int32 kLabModuleLoadFailed = 3;
constexpr int32 kLabEntryPointMissing = 4;
constexpr int32 kLabModuleEntryFailed = 5;
constexpr int32 kLabFactoryUnavailable = 6;
constexpr int32 kLabComponentUnavailable = 7;
constexpr int32 kLabAudioProcessorUnavailable = 8;
constexpr int32 kLabControllerUnavailable = 9;
constexpr int32 kLabInitializationFailed = 10;
constexpr int32 kLabParameterMetadataInvalid = 11;
constexpr int32 kLabParameterLimitExceeded = 12;
constexpr int32 kLabStateTooLarge = 13;
constexpr int32 kLabStateRoundTripFailed = 14;
constexpr int32 kLabUnsupportedBusLayout = 15;
constexpr int32 kLabSampleSizeUnsupported = 16;
constexpr int32 kLabProcessingSetupFailed = 17;
constexpr int32 kLabProcessingFailed = 18;
constexpr int32 kLabNonFiniteOutput = 19;

void* functionPointer(CFBundleRef bundle, const char* name) {
  auto string = CFStringCreateWithCString(kCFAllocatorDefault, name, kCFStringEncodingUTF8);
  if (!string) return nullptr;
  auto pointer = CFBundleGetFunctionPointerForName(bundle, string);
  CFRelease(string);
  return pointer;
}

bool decodeClassID(const char* source, char destination[16]) {
  if (!source || std::strlen(source) != 32) return false;
  for (int index = 0; index < 16; ++index) {
    unsigned int byte = 0;
    if (std::sscanf(source + index * 2, "%2x", &byte) != 1) return false;
    destination[index] = static_cast<char>(byte);
  }
  return true;
}

template <std::size_t DestinationSize>
void copyUTF16(char (&destination)[DestinationSize], const TChar* source, std::size_t sourceSize) {
  std::size_t output = 0;
  for (std::size_t index = 0; index < sourceSize && source[index] != 0; ++index) {
    const auto scalar = static_cast<uint32>(source[index]);
    if (scalar >= 0xD800 && scalar <= 0xDBFF && index + 1 < sourceSize) {
      const auto low = static_cast<uint32>(source[index + 1]);
      if (low >= 0xDC00 && low <= 0xDFFF) {
        const auto combined = 0x10000 + ((scalar - 0xD800) << 10) + (low - 0xDC00);
        if (output + 4 >= DestinationSize) break;
        destination[output++] = static_cast<char>(0xF0 | (combined >> 18));
        destination[output++] = static_cast<char>(0x80 | ((combined >> 12) & 0x3F));
        destination[output++] = static_cast<char>(0x80 | ((combined >> 6) & 0x3F));
        destination[output++] = static_cast<char>(0x80 | (combined & 0x3F));
        ++index;
        continue;
      }
    }
    if (scalar < 0x80) {
      if (output + 1 >= DestinationSize) break;
      destination[output++] = static_cast<char>(scalar);
    } else if (scalar < 0x800) {
      if (output + 2 >= DestinationSize) break;
      destination[output++] = static_cast<char>(0xC0 | (scalar >> 6));
      destination[output++] = static_cast<char>(0x80 | (scalar & 0x3F));
    } else if (scalar < 0xD800 || scalar > 0xDFFF) {
      if (output + 3 >= DestinationSize) break;
      destination[output++] = static_cast<char>(0xE0 | (scalar >> 12));
      destination[output++] = static_cast<char>(0x80 | ((scalar >> 6) & 0x3F));
      destination[output++] = static_cast<char>(0x80 | (scalar & 0x3F));
    }
  }
  destination[output] = '\0';
}

void sha256(const std::vector<uint8>& data, char destination[PS_VST3_LAB_DIGEST]) {
  unsigned char digest[CC_SHA256_DIGEST_LENGTH]{};
  CC_SHA256(data.data(), static_cast<CC_LONG>(data.size()), digest);
  for (int index = 0; index < CC_SHA256_DIGEST_LENGTH; ++index) {
    std::snprintf(destination + index * 2, 3, "%02x", digest[index]);
  }
  destination[64] = '\0';
}

class MemoryStream final : public IBStream {
public:
  tresult queryInterface(const TUID iid, void** object) override {
    if (!object) return kInvalidArgument;
    *object = nullptr;
    if (iidEqual(iid, kFUnknownIID) || iidEqual(iid, kIBStreamIID)) {
      *object = static_cast<IBStream*>(this);
      addRef();
      return kResultOk;
    }
    return kNoInterface;
  }

  uint32 addRef() override { return ++references_; }
  uint32 release() override {
    if (references_ > 1) --references_;
    return references_;
  }

  tresult read(void* buffer, int32 numBytes, int32* numBytesRead) override {
    if (!buffer || numBytes < 0) return kInvalidArgument;
    const auto available = position_ < bytes_.size() ? bytes_.size() - position_ : 0;
    const auto count = std::min<std::size_t>(available, static_cast<std::size_t>(numBytes));
    if (count > 0) std::memcpy(buffer, bytes_.data() + position_, count);
    position_ += count;
    if (numBytesRead) *numBytesRead = static_cast<int32>(count);
    return kResultOk;
  }

  tresult write(void* buffer, int32 numBytes, int32* numBytesWritten) override {
    if (!buffer || numBytes < 0) return kInvalidArgument;
    const auto count = static_cast<std::size_t>(numBytes);
    if (position_ > kMaximumStateBytes || count > kMaximumStateBytes - position_) {
      overflowed_ = true;
      if (numBytesWritten) *numBytesWritten = 0;
      return kOutOfMemory;
    }
    if (position_ + count > bytes_.size()) bytes_.resize(position_ + count);
    if (count > 0) std::memcpy(bytes_.data() + position_, buffer, count);
    position_ += count;
    if (numBytesWritten) *numBytesWritten = numBytes;
    return kResultOk;
  }

  tresult seek(int64 offset, int32 mode, int64* result) override {
    if (mode < 0 || mode > 2) return kInvalidArgument;
    int64 base = 0;
    if (mode == 1) base = static_cast<int64>(position_);
    if (mode == 2) base = static_cast<int64>(bytes_.size());
    const auto next = base + offset;
    if (next < 0 || static_cast<uint64>(next) > bytes_.size()) return kInvalidArgument;
    position_ = static_cast<std::size_t>(next);
    if (result) *result = next;
    return kResultOk;
  }

  tresult tell(int64* position) override {
    if (!position) return kInvalidArgument;
    *position = static_cast<int64>(position_);
    return kResultOk;
  }

  void rewind() { position_ = 0; }
  bool overflowed() const { return overflowed_; }
  const std::vector<uint8>& bytes() const { return bytes_; }

private:
  uint32 references_ = 1;
  std::vector<uint8> bytes_;
  std::size_t position_ = 0;
  bool overflowed_ = false;
};

class HostContext final : public IHostApplication, public IPlugInterfaceSupport {
public:
  tresult queryInterface(const TUID iid, void** object) override {
    if (!object) return kInvalidArgument;
    *object = nullptr;
    if (iidEqual(iid, kFUnknownIID) || iidEqual(iid, kIHostApplicationIID)) {
      *object = static_cast<IHostApplication*>(this);
    } else if (iidEqual(iid, kIPlugInterfaceSupportIID)) {
      *object = static_cast<IPlugInterfaceSupport*>(this);
    }
    if (!*object) return kNoInterface;
    addRef();
    return kResultOk;
  }

  uint32 addRef() override { return ++references_; }
  uint32 release() override {
    const auto remaining = --references_;
    if (remaining == 0) delete this;
    return remaining;
  }

  tresult getName(String128 name) override {
    if (!name) return kInvalidArgument;
    const char* source = "Project Sequencer VST3 Lab";
    std::size_t index = 0;
    while (source[index] != '\0' && index < 127) {
      name[index] = static_cast<unsigned char>(source[index]);
      ++index;
    }
    name[index] = 0;
    return kResultOk;
  }

  tresult createInstance(TUID, TUID, void** object) override {
    if (object) *object = nullptr;
    return kNoInterface;
  }

  tresult isPlugInterfaceSupported(const TUID) override { return kResultFalse; }

private:
  uint32 references_ = 1;
};

struct ModuleSession {
  CFBundleRef bundle = nullptr;
  BundleExitProc bundleExit = nullptr;
  IPluginFactory* factory = nullptr;
  bool entered = false;

  ~ModuleSession() {
    if (factory) factory->release();
    if (entered && bundleExit) bundleExit();
    if (bundle) CFRelease(bundle);
  }
};

struct InstanceSession {
  HostContext* host = nullptr;
  IComponent* component = nullptr;
  IAudioProcessor* processor = nullptr;
  IEditController* controller = nullptr;
  bool componentInitialized = false;
  bool controllerInitialized = false;
  bool inputActive = false;
  bool outputActive = false;
  bool active = false;
  bool processing = false;

  ~InstanceSession() {
    if (processor && processing) processor->setProcessing(0);
    if (component && active) component->setActive(0);
    if (component && outputActive) component->activateBus(kAudio, kOutput, 0, 0);
    if (component && inputActive) component->activateBus(kAudio, kInput, 0, 0);
    if (controller && controllerInitialized) controller->terminate();
    if (component && componentInitialized) component->terminate();
    if (controller) controller->release();
    if (processor) processor->release();
    if (component) component->release();
    if (host) host->release();
  }
};

int32 finish(ps_vst3_lab_result* result, int32 status) {
  result->status = status;
  return status;
}

}  // namespace

int32_t ps_vst3_run_instance_lab(
    const char* bundle_path,
    const char* processor_class_id,
    ps_vst3_lab_result* result) {
  if (!bundle_path || !processor_class_id || !result) return kLabInvalidArgument;
  std::memset(result, 0, sizeof(*result));

  char processorClassID[16]{};
  if (!decodeClassID(processor_class_id, processorClassID)) {
    return finish(result, kLabInvalidClassID);
  }

  ModuleSession module;
  const auto pathLength = std::strlen(bundle_path);
  auto url = CFURLCreateFromFileSystemRepresentation(
      kCFAllocatorDefault,
      reinterpret_cast<const UInt8*>(bundle_path),
      pathLength,
      true);
  if (!url) return finish(result, kLabModuleLoadFailed);
  module.bundle = CFBundleCreate(kCFAllocatorDefault, url);
  CFRelease(url);
  if (!module.bundle) return finish(result, kLabModuleLoadFailed);
  CFErrorRef loadError = nullptr;
  if (!CFBundleLoadExecutableAndReturnError(module.bundle, &loadError)) {
    if (loadError) CFRelease(loadError);
    return finish(result, kLabModuleLoadFailed);
  }

  auto bundleEntry = reinterpret_cast<BundleEntryProc>(functionPointer(module.bundle, "bundleEntry"));
  module.bundleExit = reinterpret_cast<BundleExitProc>(functionPointer(module.bundle, "bundleExit"));
  auto getFactory = reinterpret_cast<GetFactoryProc>(functionPointer(module.bundle, "GetPluginFactory"));
  if (!bundleEntry || !module.bundleExit || !getFactory) {
    return finish(result, kLabEntryPointMissing);
  }
  if (!bundleEntry(module.bundle)) return finish(result, kLabModuleEntryFailed);
  module.entered = true;
  module.factory = getFactory();
  if (!module.factory) return finish(result, kLabFactoryUnavailable);

  InstanceSession instance;
  instance.host = new HostContext();
  char componentIID[16]{};
  std::memcpy(componentIID, kIComponentIID, 16);
  void* componentObject = nullptr;
  if (module.factory->createInstance(processorClassID, componentIID, &componentObject) != kResultOk ||
      !componentObject) {
    return finish(result, kLabComponentUnavailable);
  }
  instance.component = static_cast<IComponent*>(componentObject);

  char controllerClassID[16]{};
  if (instance.component->getControllerClassId(controllerClassID) != kResultOk) {
    return finish(result, kLabControllerUnavailable);
  }
  if (instance.component->setIoMode(kOfflineProcessing) != kResultOk ||
      instance.component->initialize(static_cast<IHostApplication*>(instance.host)) != kResultOk) {
    return finish(result, kLabInitializationFailed);
  }
  instance.componentInitialized = true;

  char audioProcessorIID[16]{};
  std::memcpy(audioProcessorIID, kIAudioProcessorIID, 16);
  void* processorObject = nullptr;
  if (instance.component->queryInterface(audioProcessorIID, &processorObject) != kResultOk ||
      !processorObject) {
    return finish(result, kLabAudioProcessorUnavailable);
  }
  instance.processor = static_cast<IAudioProcessor*>(processorObject);

  char controllerIID[16]{};
  std::memcpy(controllerIID, kIEditControllerIID, 16);
  void* controllerObject = nullptr;
  if (module.factory->createInstance(controllerClassID, controllerIID, &controllerObject) != kResultOk ||
      !controllerObject) {
    return finish(result, kLabControllerUnavailable);
  }
  instance.controller = static_cast<IEditController*>(controllerObject);
  if (instance.controller->initialize(static_cast<IHostApplication*>(instance.host)) != kResultOk) {
    return finish(result, kLabInitializationFailed);
  }
  instance.controllerInitialized = true;

  const auto parameterCount = instance.controller->getParameterCount();
  result->parameter_count = parameterCount;
  if (parameterCount < 0) return finish(result, kLabParameterMetadataInvalid);
  if (parameterCount > PS_VST3_LAB_MAX_PARAMETERS) {
    result->parameters_truncated = 1;
    return finish(result, kLabParameterLimitExceeded);
  }
  for (int32 index = 0; index < parameterCount; ++index) {
    ParameterInfo info{};
    if (instance.controller->getParameterInfo(index, info) != kResultOk ||
        info.stepCount < 0 || !std::isfinite(info.defaultNormalizedValue) || info.defaultNormalizedValue < 0 ||
        info.defaultNormalizedValue > 1 || info.id > 0x7FFFFFFF) {
      return finish(result, kLabParameterMetadataInvalid);
    }
    auto& record = result->parameters[result->parameter_record_count++];
    record.parameter_id = info.id;
    record.step_count = info.stepCount;
    record.flags = info.flags;
    record.default_normalized = info.defaultNormalizedValue;
    record.current_normalized = instance.controller->getParamNormalized(info.id);
    if (!std::isfinite(record.current_normalized) || record.current_normalized < 0 ||
        record.current_normalized > 1) {
      return finish(result, kLabParameterMetadataInvalid);
    }
    copyUTF16(record.title, info.title, 128);
    copyUTF16(record.short_title, info.shortTitle, 128);
    copyUTF16(record.units, info.units, 128);
    if (!result->writable_parameter_round_trip && !(info.flags & kIsReadOnly) &&
        !(info.flags & kIsHidden)) {
      const auto original = record.current_normalized;
      const auto testValue = original > 0.75 ? 0.25 : 0.75;
      if (instance.controller->setParamNormalized(info.id, testValue) != kResultOk ||
          std::abs(instance.controller->getParamNormalized(info.id) - testValue) > 1e-9 ||
          instance.controller->setParamNormalized(info.id, original) != kResultOk) {
        return finish(result, kLabParameterMetadataInvalid);
      }
      result->writable_parameter_round_trip = 1;
    }
  }

  MemoryStream componentState;
  const auto componentStateResult = instance.component->getState(&componentState);
  if (componentState.overflowed()) return finish(result, kLabStateTooLarge);
  if (componentStateResult != kResultOk || componentState.bytes().empty()) {
    return finish(result, kLabStateRoundTripFailed);
  }
  result->component_state_bytes = static_cast<int32>(componentState.bytes().size());
  sha256(componentState.bytes(), result->component_state_sha256);
  componentState.rewind();
  if (instance.component->setState(&componentState) != kResultOk) {
    return finish(result, kLabStateRoundTripFailed);
  }
  result->component_state_round_trip = 1;
  componentState.rewind();
  if (instance.controller->setComponentState(&componentState) != kResultOk) {
    return finish(result, kLabStateRoundTripFailed);
  }

  MemoryStream controllerState;
  if (instance.controller->getState(&controllerState) != kResultOk ||
      controllerState.overflowed() || controllerState.bytes().empty()) {
    return finish(result, controllerState.overflowed() ? kLabStateTooLarge : kLabStateRoundTripFailed);
  }
  result->controller_state_bytes = static_cast<int32>(controllerState.bytes().size());
  sha256(controllerState.bytes(), result->controller_state_sha256);
  controllerState.rewind();
  if (instance.controller->setState(&controllerState) != kResultOk) {
    return finish(result, kLabStateRoundTripFailed);
  }
  result->controller_state_round_trip = 1;

  result->input_bus_count = instance.component->getBusCount(kAudio, kInput);
  result->output_bus_count = instance.component->getBusCount(kAudio, kOutput);
  if (result->input_bus_count != 1 || result->output_bus_count != 1) {
    return finish(result, kLabUnsupportedBusLayout);
  }
  BusInfo inputInfo{};
  BusInfo outputInfo{};
  if (instance.component->getBusInfo(kAudio, kInput, 0, inputInfo) != kResultOk ||
      instance.component->getBusInfo(kAudio, kOutput, 0, outputInfo) != kResultOk ||
      inputInfo.channelCount != 2 || outputInfo.channelCount != 2) {
    return finish(result, kLabUnsupportedBusLayout);
  }
  result->input_channels = inputInfo.channelCount;
  result->output_channels = outputInfo.channelCount;

  if (instance.processor->canProcessSampleSize(kSample32) != kResultOk) {
    return finish(result, kLabSampleSizeUnsupported);
  }
  SpeakerArrangement inputArrangement = kStereo;
  SpeakerArrangement outputArrangement = kStereo;
  if (instance.processor->setBusArrangements(&inputArrangement, 1, &outputArrangement, 1) != kResultOk) {
    return finish(result, kLabUnsupportedBusLayout);
  }
  ProcessSetup setup{kOffline, kSample32, 64, 48000.0};
  if (instance.processor->setupProcessing(setup) != kResultOk) {
    return finish(result, kLabProcessingSetupFailed);
  }
  result->latency_samples = instance.processor->getLatencySamples();
  result->tail_samples = instance.processor->getTailSamples();
  if (instance.component->activateBus(kAudio, kInput, 0, 1) != kResultOk) {
    return finish(result, kLabProcessingSetupFailed);
  }
  instance.inputActive = true;
  if (instance.component->activateBus(kAudio, kOutput, 0, 1) != kResultOk) {
    return finish(result, kLabProcessingSetupFailed);
  }
  instance.outputActive = true;
  if (instance.component->setActive(1) != kResultOk) {
    return finish(result, kLabProcessingSetupFailed);
  }
  instance.active = true;
  if (instance.processor->setProcessing(1) != kResultOk) {
    return finish(result, kLabProcessingSetupFailed);
  }
  instance.processing = true;

  std::array<Sample32, 64> inputLeft{};
  std::array<Sample32, 64> inputRight{};
  std::array<Sample32, 64> outputLeft{};
  std::array<Sample32, 64> outputRight{};
  Sample32* inputChannels[] = {inputLeft.data(), inputRight.data()};
  Sample32* outputChannels[] = {outputLeft.data(), outputRight.data()};
  AudioBusBuffers inputBuffers{2, 0x3, {.channelBuffers32 = inputChannels}};
  AudioBusBuffers outputBuffers{2, 0, {.channelBuffers32 = outputChannels}};
  ProcessData data{
      kOffline, kSample32, 64, 1, 1,
      &inputBuffers, &outputBuffers,
      nullptr, nullptr, nullptr, nullptr, nullptr};
  double peak = 0;
  for (int block = 0; block < 4; ++block) {
    outputLeft.fill(std::numeric_limits<float>::quiet_NaN());
    outputRight.fill(std::numeric_limits<float>::quiet_NaN());
    if (instance.processor->process(data) != kResultOk) {
      return finish(result, kLabProcessingFailed);
    }
    ++result->processed_blocks;
    for (int sample = 0; sample < 64; ++sample) {
      if (!std::isfinite(outputLeft[sample]) || !std::isfinite(outputRight[sample])) {
        return finish(result, kLabNonFiniteOutput);
      }
      peak = std::max(peak, static_cast<double>(std::abs(outputLeft[sample])));
      peak = std::max(peak, static_cast<double>(std::abs(outputRight[sample])));
    }
  }
  result->output_is_finite = 1;
  result->zero_input_peak = peak;
  return finish(result, 0);
}
