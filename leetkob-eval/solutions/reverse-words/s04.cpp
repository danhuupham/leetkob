#include <bits/stdc++.h>
using namespace std;

int main() {
    string w;
    bool first = true;
    while (cin >> w) {
        reverse(w.begin(), w.end());
        if (!first) cout << " ";
        cout << w;
        first = false;
    }
    cout << "\n";
}
