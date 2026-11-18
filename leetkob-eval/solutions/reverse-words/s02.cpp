#include <iostream>
#include <string>
using namespace std;

void daoChuoi(string& s, int l, int r) {
    if (l >= r) return;
    char t = s[l];
    s[l] = s[r];
    s[r] = t;
    daoChuoi(s, l + 1, r - 1);
}

int main() {
    string tu;
    bool dau = true;
    while (cin >> tu) {
        daoChuoi(tu, 0, (int)tu.size() - 1);
        if (!dau) cout << ' ';
        cout << tu;
        dau = false;
    }
    cout << '\n';
    return 0;
}
