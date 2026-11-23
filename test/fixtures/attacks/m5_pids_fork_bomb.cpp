#include <cerrno>
#include <cstring>
#include <iostream>
#include <unistd.h>

int main() {
  for (int i = 0; i < 32; ++i) {
    pid_t pid = fork();
    if (pid < 0) {
      std::cerr << "fork blocked at " << i << ": " << std::strerror(errno) << '\n';
      return 1;
    }
    if (pid == 0) {
      close(STDOUT_FILENO);
      close(STDERR_FILENO);
      sleep(2);
      _exit(0);
    }
  }
  std::cout << "PWNED\n" << std::flush;
  return 0;
}
