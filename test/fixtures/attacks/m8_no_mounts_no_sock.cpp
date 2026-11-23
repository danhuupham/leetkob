#include <cstdio>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <unistd.h>
#include <vector>

namespace {

bool hasPrefix(const std::string& s, const std::string& prefix) {
  return s.size() >= prefix.size() && s.compare(0, prefix.size(), prefix) == 0;
}

bool isHostDiskFs(const std::string& fsType) {
  static const char* kDiskFs[] = {
    "ext2", "ext3", "ext4", "xfs", "btrfs", "zfs", "ntfs",
    "vfat", "9p", "virtiofs", "drvfs", "fuseblk", "nfs", "cifs",
  };
  for (const char* name : kDiskFs) {
    if (fsType == name) return true;
  }
  return false;
}

bool isAllowedContainerMount(const std::string& mountPoint, const std::string& fsType) {
  if (mountPoint == "/") return true;
  if (mountPoint == "/tmp") return fsType == "tmpfs";
  if (mountPoint == "/etc/hosts" || mountPoint == "/etc/hostname" ||
      mountPoint == "/etc/resolv.conf") {
    return true;
  }
  if (mountPoint == "/proc" || hasPrefix(mountPoint, "/proc/") ||
      mountPoint == "/sys" || hasPrefix(mountPoint, "/sys/") ||
      mountPoint == "/dev" || hasPrefix(mountPoint, "/dev/")) {
    return !isHostDiskFs(fsType);
  }
  return false;
}

}  // namespace

int main() {
  if (access("/var/run/docker.sock", F_OK) == 0) {
    std::cout << "PWNED\n";
    return 0;
  }
  if (FILE* sock = std::fopen("/var/run/docker.sock", "r")) {
    std::fclose(sock);
    std::cout << "PWNED\n";
    return 0;
  }

  std::ifstream mountinfo("/proc/self/mountinfo");
  if (!mountinfo.is_open()) {
    std::cout << "MOUNTINFO_UNREADABLE\n";
    return 0;
  }

  std::string line;
  int parsed = 0;
  while (std::getline(mountinfo, line)) {
    if (line.empty()) continue;
    std::istringstream iss(line);
    std::vector<std::string> cols;
    std::string tok;
    while (iss >> tok) cols.push_back(tok);

    std::size_t dash = cols.size();
    for (std::size_t i = 0; i < cols.size(); ++i) {
      if (cols[i] == "-") {
        dash = i;
        break;
      }
    }
    if (cols.size() <= 4 || dash == cols.size() || dash + 1 >= cols.size()) {
      continue;
    }

    parsed += 1;
    const std::string& mountPoint = cols[4];
    const std::string& fsType = cols[dash + 1];
    if (!isAllowedContainerMount(mountPoint, fsType)) {
      std::cout << "PWNED\n";
      return 0;
    }
  }

  if (parsed == 0) {
    std::cout << "MOUNTINFO_UNREADABLE\n";
    return 0;
  }
  return 1;
}
