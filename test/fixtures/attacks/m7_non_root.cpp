#include <cstdio>
#include <iostream>
#include <unistd.h>

int main() {
  uid_t uid = getuid();
  uid_t euid = geteuid();
  if (uid == 0 || euid == 0 || uid != 65534 || euid != 65534) {
    std::cout << "PWNED\n";
    return 0;
  }
  if (setuid(0) == 0) {
    std::cout << "PWNED\n";
    return 0;
  }
  FILE* f = std::fopen("/etc/pwn", "w");
  if (f != nullptr) {
    std::fclose(f);
    std::cout << "PWNED\n";
    return 0;
  }
  return 1;
}
