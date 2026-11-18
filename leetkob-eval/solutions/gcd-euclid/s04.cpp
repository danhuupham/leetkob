#include <bits/stdc++.h>
using namespace std;

int main() {
    int q;
    cin >> q;
    while (q--) {
        long long a, b;
        cin >> a >> b;
        long long g = __gcd(a, b);
        cout << g << " " << a / g * b << endl;
    }
    return 0;
}
