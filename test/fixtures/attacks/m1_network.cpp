#include <arpa/inet.h>
#include <cerrno>
#include <cstring>
#include <iostream>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>

namespace {
bool tryTcpConnect(const char* ip, int port) {
  int fd = socket(AF_INET, SOCK_STREAM, 0);
  if (fd < 0) return false;
  sockaddr_in addr{};
  addr.sin_family = AF_INET;
  addr.sin_port = htons(static_cast<uint16_t>(port));
  if (inet_pton(AF_INET, ip, &addr.sin_addr) != 1) {
    close(fd);
    return false;
  }
  int rc = connect(fd, reinterpret_cast<sockaddr*>(&addr), sizeof(addr));
  close(fd);
  return rc == 0;
}

bool tryUdpSend(const char* ip, int port) {
  int fd = socket(AF_INET, SOCK_DGRAM, 0);
  if (fd < 0) return false;
  sockaddr_in addr{};
  addr.sin_family = AF_INET;
  addr.sin_port = htons(static_cast<uint16_t>(port));
  if (inet_pton(AF_INET, ip, &addr.sin_addr) != 1) {
    close(fd);
    return false;
  }
  const char payload[] = "ping";
  ssize_t sent = sendto(
    fd,
    payload,
    sizeof(payload) - 1,
    0,
    reinterpret_cast<sockaddr*>(&addr),
    sizeof(addr)
  );
  close(fd);
  return sent >= 0;
}
}  // namespace

int main() {
  if (tryTcpConnect("1.1.1.1", 80) || tryUdpSend("1.1.1.1", 53) || tryUdpSend("8.8.8.8", 53)) {
    std::cout << "PWNED\n";
    return 0;
  }
  std::cerr << "Network blocked: " << std::strerror(errno) << '\n';
  return 1;
}
