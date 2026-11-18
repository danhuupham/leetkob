#include <bits/stdc++.h>
using namespace std;

namespace toan {
    long long gcd(long long a, long long b) {
        return b == 0 ? a : gcd(b, a % b);
    }
    long long lcm(long long a, long long b) {
        return a / gcd(a, b) * b;
    }
}

int main() {
    int q;
    cin >> q;
    for (int i = 0; i < q; i++) {
        long long a, b;
        cin >> a >> b;
        cout << toan::gcd(a, b) << ' ' << toan::lcm(a, b) << '\n';
    }
    return 0;
}
