#include <iostream>
#include <string>
using namespace std;

void xuLyTu(string& w) {
    string t = "";
    for (char c : w) t = c + t;
    w = t;
}

int main() {
    string w;
    int dem = 0;
    while (cin >> w) {
        xuLyTu(w);
        if (dem > 0) cout << " ";
        cout << w;
        dem++;
    }
    cout << endl;
    return 0;
}
