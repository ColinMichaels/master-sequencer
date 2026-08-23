#include "PSVst3Abi.hpp"

#include <CoreFoundation/CoreFoundation.h>
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>

namespace {

using namespace ps_vst3_abi;

const char kFactory2IID[16] = {
    0x00, 0x07, static_cast<char>(0xB6), 0x50, static_cast<char>(0xF2), 0x4B, 0x4C, 0x0B,
    static_cast<char>(0xA4), 0x64, static_cast<char>(0xED), static_cast<char>(0xB9),
    static_cast<char>(0xF0), 0x0B, 0x2A, static_cast<char>(0xBB),
};

const char kProcessorID[16] = {
    static_cast<char>(0xBD), 0x58, static_cast<char>(0xB5), 0x50,
    static_cast<char>(0xF9), static_cast<char>(0xE5), 0x63, 0x4E,
    static_cast<char>(0x9D), 0x2E, static_cast<char>(0xFF), 0x39,
    static_cast<char>(0xEA), 0x09, 0x27, static_cast<char>(0xB1),
};

const char kControllerID[16] = {
    static_cast<char>(0xA0), static_cast<char>(0xB1), static_cast<char>(0xA6),
    static_cast<char>(0xF4), 0x00, 0x5D, static_cast<char>(0x9B), 0x47,
    static_cast<char>(0x96), 0x71, 0x77, static_cast<char>(0xE3),
    0x7A, 0x67, 0x18, static_cast<char>(0x91),
};

constexpr uint32 kGainParameterID = 100;
constexpr uint32 kProcessorStateMagic = 0x50535633;
constexpr uint32 kControllerStateMagic = 0x50534333;

template <std::size_t DestinationSize>
void copyText(char (&destination)[DestinationSize], const char* source) {
  const auto count = std::min<std::size_t>(std::strlen(source), DestinationSize - 1);
  std::memcpy(destination, source, count);
  destination[count] = '\0';
}

void copyText16(TChar* destination, std::size_t destinationSize, const char* source) {
  if (!destination || destinationSize == 0) return;
  std::size_t index = 0;
  while (source[index] != '\0' && index + 1 < destinationSize) {
    destination[index] = static_cast<unsigned char>(source[index]);
    ++index;
  }
  destination[index] = 0;
}

bool matches(const TUID iid, const unsigned char expected[16]) {
  return iidEqual(iid, expected);
}

bool readExact(IBStream* stream, void* value, int32 size) {
  if (!stream || !value || size <= 0) return false;
  int32 bytesRead = 0;
  return stream->read(value, size, &bytesRead) == kResultOk && bytesRead == size;
}

bool writeExact(IBStream* stream, void* value, int32 size) {
  if (!stream || !value || size <= 0) return false;
  int32 bytesWritten = 0;
  return stream->write(value, size, &bytesWritten) == kResultOk && bytesWritten == size;
}

class FixtureProcessor final : public IComponent, public IAudioProcessor {
public:
  tresult queryInterface(const TUID iid, void** object) override {
    if (!object) return kInvalidArgument;
    *object = nullptr;
    if (matches(iid, kFUnknownIID) || matches(iid, kIPluginBaseIID) ||
        matches(iid, kIComponentIID)) {
      *object = static_cast<IComponent*>(this);
    } else if (matches(iid, kIAudioProcessorIID)) {
      *object = static_cast<IAudioProcessor*>(this);
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

  tresult initialize(FUnknown* context) override {
    if (!context || initialized_) return kInvalidArgument;
    void* hostObject = nullptr;
    char hostIID[16]{};
    std::memcpy(hostIID, kIHostApplicationIID, 16);
    if (context->queryInterface(hostIID, &hostObject) != kResultOk || !hostObject) {
      return kNotInitialized;
    }
    auto* host = static_cast<IHostApplication*>(hostObject);
    String128 hostName{};
    const auto hostResult = host->getName(hostName);
    host->release();
    if (hostResult != kResultOk || hostName[0] == 0) return kNotInitialized;
    initialized_ = true;
    return kResultOk;
  }

  tresult terminate() override {
    if (!initialized_ || active_ || processing_) return kNotInitialized;
    initialized_ = false;
    return kResultOk;
  }

  tresult getControllerClassId(TUID classID) override {
    if (!classID) return kInvalidArgument;
    std::memcpy(classID, kControllerID, 16);
    return kResultOk;
  }

  tresult setIoMode(IoMode mode) override {
    if (initialized_) return kInvalidArgument;
    ioMode_ = mode;
    return mode == kOfflineProcessing ? kResultOk : kResultFalse;
  }

  int32 getBusCount(MediaType type, BusDirection direction) override {
    return initialized_ && type == kAudio && (direction == kInput || direction == kOutput) ? 1 : 0;
  }

  tresult getBusInfo(
      MediaType type, BusDirection direction, int32 index, BusInfo& bus) override {
    if (!initialized_ || type != kAudio || index != 0 ||
        (direction != kInput && direction != kOutput)) {
      return kInvalidArgument;
    }
    bus = {};
    bus.mediaType = kAudio;
    bus.direction = direction;
    bus.channelCount = 2;
    copyText16(bus.name, 128, direction == kInput ? "Stereo Input" : "Stereo Output");
    bus.busType = kMain;
    bus.flags = 1;
    return kResultOk;
  }

  tresult getRoutingInfo(RoutingInfo&, RoutingInfo&) override { return kNotImplemented; }

  tresult activateBus(
      MediaType type, BusDirection direction, int32 index, TBool state) override {
    if (!initialized_ || type != kAudio || index != 0 ||
        (direction != kInput && direction != kOutput)) {
      return kInvalidArgument;
    }
    if (direction == kInput) {
      inputActive_ = state != 0;
    } else {
      outputActive_ = state != 0;
    }
    return kResultOk;
  }

  tresult setActive(TBool state) override {
    if (!initialized_ || (state != 0 && (!setup_ || !inputActive_ || !outputActive_))) {
      return kNotInitialized;
    }
    active_ = state != 0;
    return kResultOk;
  }

  tresult setState(IBStream* state) override {
    uint32 magic = 0;
    double gain = 0;
    if (!readExact(state, &magic, sizeof(magic)) ||
        !readExact(state, &gain, sizeof(gain)) ||
        magic != kProcessorStateMagic || !std::isfinite(gain) || gain < 0 || gain > 1) {
      return kInvalidArgument;
    }
    gain_ = gain;
    return kResultOk;
  }

  tresult getState(IBStream* state) override {
    if (std::getenv("PROJECT_SEQUENCER_VST3_FIXTURE_OVERSIZED_STATE")) {
      char bytes[4096]{};
      for (int index = 0; index < 257; ++index) {
        if (!writeExact(state, bytes, sizeof(bytes))) return kOutOfMemory;
      }
      return kResultOk;
    }
    uint32 magic = kProcessorStateMagic;
    double gain = gain_;
    return writeExact(state, &magic, sizeof(magic)) && writeExact(state, &gain, sizeof(gain))
        ? kResultOk
        : kInternalError;
  }

  tresult setBusArrangements(
      SpeakerArrangement* inputs, int32 inputCount,
      SpeakerArrangement* outputs, int32 outputCount) override {
    if (!initialized_ || !inputs || !outputs || inputCount != 1 || outputCount != 1) {
      return kInvalidArgument;
    }
    return inputs[0] == kStereo && outputs[0] == kStereo ? kResultOk : kResultFalse;
  }

  tresult getBusArrangement(
      BusDirection direction, int32 index, SpeakerArrangement& arrangement) override {
    if (!initialized_ || index != 0 || (direction != kInput && direction != kOutput)) {
      return kInvalidArgument;
    }
    arrangement = kStereo;
    return kResultOk;
  }

  tresult canProcessSampleSize(int32 size) override {
    return size == kSample32 ? kResultOk : kResultFalse;
  }

  uint32 getLatencySamples() override { return 64; }

  tresult setupProcessing(ProcessSetup& setup) override {
    if (!initialized_ || active_ || ioMode_ != kOfflineProcessing || setup.processMode != kOffline ||
        setup.symbolicSampleSize != kSample32 || setup.maxSamplesPerBlock != 64 ||
        setup.sampleRate != 48000.0) {
      return kInvalidArgument;
    }
    setup_ = true;
    return kResultOk;
  }

  tresult setProcessing(TBool state) override {
    if (!active_) return kNotInitialized;
    processing_ = state != 0;
    return kResultOk;
  }

  tresult process(ProcessData& data) override {
    if (!processing_ || data.processMode != kOffline || data.symbolicSampleSize != kSample32 ||
        data.numSamples != 64 || data.numInputs != 1 || data.numOutputs != 1 ||
        !data.inputs || !data.outputs || data.inputs[0].numChannels != 2 ||
        data.outputs[0].numChannels != 2 || !data.inputs[0].channelBuffers32 ||
        !data.outputs[0].channelBuffers32) {
      return kInvalidArgument;
    }
    for (int channel = 0; channel < 2; ++channel) {
      auto* input = data.inputs[0].channelBuffers32[channel];
      auto* output = data.outputs[0].channelBuffers32[channel];
      if (!input || !output) return kInvalidArgument;
      for (int sample = 0; sample < data.numSamples; ++sample) {
        output[sample] = static_cast<float>(input[sample] * gain_);
      }
    }
    ++processedBlocks_;
    return kResultOk;
  }

  uint32 getTailSamples() override { return 96; }

private:
  uint32 references_ = 1;
  bool initialized_ = false;
  bool setup_ = false;
  bool inputActive_ = false;
  bool outputActive_ = false;
  bool active_ = false;
  bool processing_ = false;
  IoMode ioMode_ = 0;
  double gain_ = 0.5;
  int processedBlocks_ = 0;
};

class FixtureController final : public IEditController {
public:
  tresult queryInterface(const TUID iid, void** object) override {
    if (!object) return kInvalidArgument;
    *object = nullptr;
    if (matches(iid, kFUnknownIID) || matches(iid, kIPluginBaseIID) ||
        matches(iid, kIEditControllerIID)) {
      *object = static_cast<IEditController*>(this);
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

  tresult initialize(FUnknown* context) override {
    if (!context || initialized_) return kInvalidArgument;
    initialized_ = true;
    return kResultOk;
  }

  tresult terminate() override {
    if (!initialized_) return kNotInitialized;
    initialized_ = false;
    return kResultOk;
  }

  tresult setComponentState(IBStream* state) override {
    uint32 magic = 0;
    double gain = 0;
    if (!readExact(state, &magic, sizeof(magic)) ||
        !readExact(state, &gain, sizeof(gain)) ||
        magic != kProcessorStateMagic || !std::isfinite(gain)) {
      return kInvalidArgument;
    }
    value_ = std::clamp(gain, 0.0, 1.0);
    return kResultOk;
  }

  tresult setState(IBStream* state) override {
    uint32 magic = 0;
    double value = 0;
    if (!readExact(state, &magic, sizeof(magic)) ||
        !readExact(state, &value, sizeof(value)) ||
        magic != kControllerStateMagic || !std::isfinite(value)) {
      return kInvalidArgument;
    }
    value_ = std::clamp(value, 0.0, 1.0);
    return kResultOk;
  }

  tresult getState(IBStream* state) override {
    uint32 magic = kControllerStateMagic;
    double value = value_;
    return writeExact(state, &magic, sizeof(magic)) && writeExact(state, &value, sizeof(value))
        ? kResultOk
        : kInternalError;
  }

  int32 getParameterCount() override { return 1; }

  tresult getParameterInfo(int32 index, ParameterInfo& info) override {
    if (index != 0) return kInvalidArgument;
    info = {};
    info.id = kGainParameterID;
    copyText16(info.title, 128, "Gain");
    copyText16(info.shortTitle, 128, "Gain");
    copyText16(info.units, 128, "%");
    info.stepCount = 0;
    info.defaultNormalizedValue = 0.5;
    info.unitID = 0;
    info.flags = kCanAutomate;
    return kResultOk;
  }

  tresult getParamStringByValue(ParamID id, ParamValue normalized, String128 text) override {
    if (id != kGainParameterID || !std::isfinite(normalized)) return kInvalidArgument;
    char value[32]{};
    std::snprintf(value, sizeof(value), "%.1f%%", std::clamp(normalized, 0.0, 1.0) * 100.0);
    copyText16(text, 128, value);
    return kResultOk;
  }

  tresult getParamValueByString(ParamID, TChar*, ParamValue&) override { return kNotImplemented; }

  ParamValue normalizedParamToPlain(ParamID id, ParamValue normalized) override {
    return id == kGainParameterID ? normalized * 100.0 : 0.0;
  }

  ParamValue plainParamToNormalized(ParamID id, ParamValue plain) override {
    return id == kGainParameterID ? plain / 100.0 : 0.0;
  }

  ParamValue getParamNormalized(ParamID id) override {
    return id == kGainParameterID ? value_ : 0.0;
  }

  tresult setParamNormalized(ParamID id, ParamValue normalized) override {
    if (id != kGainParameterID || !std::isfinite(normalized) || normalized < 0 || normalized > 1) {
      return kInvalidArgument;
    }
    value_ = normalized;
    return kResultOk;
  }

  tresult setComponentHandler(IComponentHandler*) override { return kResultOk; }
  IPlugView* createView(FIDString) override { return nullptr; }

private:
  uint32 references_ = 1;
  bool initialized_ = false;
  double value_ = 0.5;
};

class FixtureFactory final : public IPluginFactory2 {
public:
  tresult queryInterface(const TUID iid, void** object) override {
    if (!object) return kInvalidArgument;
    if (std::memcmp(iid, kFactory2IID, 16) == 0) {
      *object = static_cast<IPluginFactory2*>(this);
      addRef();
      return kResultOk;
    }
    *object = nullptr;
    return kNoInterface;
  }

  uint32 addRef() override { return ++references_; }

  uint32 release() override {
    const auto remaining = --references_;
    if (remaining == 0) delete this;
    return remaining;
  }

  tresult getFactoryInfo(PFactoryInfo* info) override {
    if (!info) return kInvalidArgument;
    *info = {};
    copyText(info->vendor, "Project Sequencer Fixture Audio");
    copyText(info->url, "https://example.invalid");
    copyText(info->email, "fixture@example.invalid");
    return kResultOk;
  }

  int32 countClasses() override { return 2; }

  tresult getClassInfo(int32 index, PClassInfo* info) override {
    if (!info || index < 0 || index > 1) return kInvalidArgument;
    *info = {};
    std::memcpy(info->cid, index == 0 ? kProcessorID : kControllerID, 16);
    info->cardinality = kManyInstances;
    copyText(info->category, index == 0 ? "Audio Module Class" : "Component Controller Class");
    copyText(info->name, index == 0 ? "Fixture Processor" : "Fixture Controller");
    return kResultOk;
  }

  tresult createInstance(FIDString classID, FIDString interfaceID, void** object) override {
    if (!classID || !interfaceID || !object) return kInvalidArgument;
    *object = nullptr;
    if (std::memcmp(classID, kProcessorID, 16) == 0) {
      auto* processor = new FixtureProcessor();
      const auto result = processor->queryInterface(interfaceID, object);
      processor->release();
      return result;
    }
    if (std::memcmp(classID, kControllerID, 16) == 0) {
      auto* controller = new FixtureController();
      const auto result = controller->queryInterface(interfaceID, object);
      controller->release();
      return result;
    }
    return kNoInterface;
  }

  tresult getClassInfo2(int32 index, PClassInfo2* info) override {
    if (!info || index < 0 || index > 1) return kInvalidArgument;
    *info = {};
    std::memcpy(info->cid, index == 0 ? kProcessorID : kControllerID, 16);
    info->cardinality = kManyInstances;
    copyText(info->category, index == 0 ? "Audio Module Class" : "Component Controller Class");
    copyText(info->name, index == 0 ? "Fixture Processor" : "Fixture Controller");
    copyText(info->vendor, "Project Sequencer Fixture Audio");
    copyText(info->version, "1.0.0");
    copyText(info->sdkVersion, "VST 3.8 fixture");
    copyText(info->subCategories, index == 0 ? "Fx|Mastering" : "");
    return kResultOk;
  }

private:
  uint32 references_ = 1;
};

}  // namespace

extern "C" __attribute__((visibility("default"))) bool bundleEntry(CFBundleRef) { return true; }
extern "C" __attribute__((visibility("default"))) bool bundleExit() { return true; }
extern "C" __attribute__((visibility("default"))) ps_vst3_abi::IPluginFactory* GetPluginFactory() {
  return new FixtureFactory();
}
