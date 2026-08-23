#include "PSVst3FactoryProbe.h"
#include "PSVst3Abi.hpp"

#include <CoreFoundation/CoreFoundation.h>
#include <algorithm>
#include <cstdio>
#include <cstring>

namespace {

using namespace ps_vst3_abi;

enum ProbeStatus : int32_t {
  kProbeOK = 0,
  kProbeInvalidArgument = 1,
  kBundleURLFailed = 2,
  kBundleCreateFailed = 3,
  kBundleLoadFailed = 4,
  kBundleEntryMissing = 5,
  kBundleExitMissing = 6,
  kFactoryMissing = 7,
  kBundleEntryFailed = 8,
  kFactoryReturnedNull = 9,
  kFactoryInfoFailed = 10,
  kInvalidClassCount = 11,
};

template <std::size_t DestinationSize>
void copyBounded(char (&destination)[DestinationSize], const char* source, std::size_t sourceSize) {
  if (!source || DestinationSize == 0) return;
  const auto count = std::min<std::size_t>(strnlen(source, sourceSize), DestinationSize - 1);
  std::memcpy(destination, source, count);
  destination[count] = '\0';
}

void encodeClassID(const char source[16], char destination[PS_VST3_PROBE_TEXT_32]) {
  for (int index = 0; index < 16; ++index) {
    std::snprintf(destination + (index * 2), 3, "%02X", static_cast<unsigned char>(source[index]));
  }
  destination[32] = '\0';
}

void* functionPointer(CFBundleRef bundle, const char* name) {
  auto string = CFStringCreateWithCString(kCFAllocatorDefault, name, kCFStringEncodingUTF8);
  if (!string) return nullptr;
  auto pointer = CFBundleGetFunctionPointerForName(bundle, string);
  CFRelease(string);
  return pointer;
}

int32_t finishFailure(CFBundleRef bundle, int32_t status) {
  if (bundle) CFRelease(bundle);
  return status;
}

}  // namespace

int32_t ps_vst3_probe_bundle(const char* bundle_path, ps_vst3_probe_result* result) {
  if (!bundle_path || !result) return kProbeInvalidArgument;
  std::memset(result, 0, sizeof(*result));

  const auto length = std::strlen(bundle_path);
  auto url = CFURLCreateFromFileSystemRepresentation(
      kCFAllocatorDefault, reinterpret_cast<const UInt8*>(bundle_path), length, true);
  if (!url) return result->status = kBundleURLFailed;
  auto bundle = CFBundleCreate(kCFAllocatorDefault, url);
  CFRelease(url);
  if (!bundle) return result->status = kBundleCreateFailed;

  CFErrorRef error = nullptr;
  if (!CFBundleLoadExecutableAndReturnError(bundle, &error)) {
    if (error) CFRelease(error);
    result->status = kBundleLoadFailed;
    return finishFailure(bundle, result->status);
  }

  auto bundleEntry = reinterpret_cast<BundleEntryProc>(functionPointer(bundle, "bundleEntry"));
  auto bundleExit = reinterpret_cast<BundleExitProc>(functionPointer(bundle, "bundleExit"));
  auto getFactory = reinterpret_cast<GetFactoryProc>(functionPointer(bundle, "GetPluginFactory"));
  if (!bundleEntry) return result->status = finishFailure(bundle, kBundleEntryMissing);
  if (!bundleExit) return result->status = finishFailure(bundle, kBundleExitMissing);
  if (!getFactory) return result->status = finishFailure(bundle, kFactoryMissing);
  if (!bundleEntry(bundle)) return result->status = finishFailure(bundle, kBundleEntryFailed);

  auto factory = getFactory();
  if (!factory) {
    bundleExit();
    return result->status = finishFailure(bundle, kFactoryReturnedNull);
  }

  PFactoryInfo factoryInfo{};
  if (factory->getFactoryInfo(&factoryInfo) != kResultOk) {
    factory->release();
    bundleExit();
    return result->status = finishFailure(bundle, kFactoryInfoFailed);
  }
  copyBounded(result->factory_vendor, factoryInfo.vendor, sizeof(factoryInfo.vendor));

  const auto classCount = factory->countClasses();
  if (classCount < 0 || classCount > 4096) {
    factory->release();
    bundleExit();
    return result->status = finishFailure(bundle, kInvalidClassCount);
  }
  result->total_classes = classCount;

  IPluginFactory2* factory2 = nullptr;
  void* factory2Object = nullptr;
  char factory2IID[16]{};
  std::memcpy(factory2IID, kIPluginFactory2IID, sizeof(factory2IID));
  if (factory->queryInterface(factory2IID, &factory2Object) == kResultOk && factory2Object) {
    factory2 = static_cast<IPluginFactory2*>(factory2Object);
  }

  for (int32 index = 0; index < classCount; ++index) {
    if (result->record_count >= PS_VST3_PROBE_MAX_CLASSES) {
      result->records_truncated = 1;
      break;
    }
    auto& record = result->classes[result->record_count];
    if (factory2) {
      PClassInfo2 info{};
      if (factory2->getClassInfo2(index, &info) != kResultOk) {
        ++result->class_info_failures;
        continue;
      }
      encodeClassID(info.cid, record.class_id);
      copyBounded(record.category, info.category, sizeof(info.category));
      copyBounded(record.name, info.name, sizeof(info.name));
      copyBounded(record.vendor, info.vendor, sizeof(info.vendor));
      copyBounded(record.version, info.version, sizeof(info.version));
      copyBounded(record.sdk_version, info.sdkVersion, sizeof(info.sdkVersion));
      copyBounded(record.sub_categories, info.subCategories, sizeof(info.subCategories));
    } else {
      PClassInfo info{};
      if (factory->getClassInfo(index, &info) != kResultOk) {
        ++result->class_info_failures;
        continue;
      }
      encodeClassID(info.cid, record.class_id);
      copyBounded(record.category, info.category, sizeof(info.category));
      copyBounded(record.name, info.name, sizeof(info.name));
      copyBounded(record.vendor, factoryInfo.vendor, sizeof(factoryInfo.vendor));
    }
    ++result->record_count;
  }

  if (factory2) factory2->release();
  factory->release();
  bundleExit();
  CFRelease(bundle);
  result->status = kProbeOK;
  return kProbeOK;
}
